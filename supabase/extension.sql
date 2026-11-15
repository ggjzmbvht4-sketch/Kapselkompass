-- Additive v2: private stock ledger, atomic tasting consumption and server-side discovery quotas.
alter table public.coffee_tastings add constraint coffee_consumed_valid check(not(data?'consumed') or (jsonb_typeof(data->'consumed')='number' and (data->>'consumed')::numeric between 0 and 1000 and (data->>'consumed')::numeric=trunc((data->>'consumed')::numeric)));
create table public.coffee_inventory (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 data jsonb not null,
 version integer not null default 1 check(version=1),
 deleted boolean not null default false check(not deleted),
 updated_at timestamptz not null default clock_timestamp(),
 capsule_id uuid generated always as ((data->>'capsule_id')::uuid) stored not null,
 foreign key(capsule_id,user_id) references public.coffee_capsules(id,user_id),
 check(coalesce(data->>'type' in ('opening','purchase','consume','correction','threshold','tasting'),false)),
 check(coalesce(jsonb_typeof(data->'amount')='number' and (data->>'amount')::numeric=trunc((data->>'amount')::numeric) and abs((data->>'amount')::numeric)<=1000000,false)),
 check(coalesce(length(data->>'note')<=500,false)),
 check(not(data?'threshold') or (jsonb_typeof(data->'threshold')='number' and (data->>'threshold')::numeric between 0 and 10000 and (data->>'threshold')::numeric=trunc((data->>'threshold')::numeric))),
 check(data->>'type' not in ('opening','purchase') or (data->>'amount')::numeric>=0),
 check(data->>'type'<>'consume' or (data->>'amount')::numeric<0),
 check(data->>'type'<>'threshold' or (data->>'amount')::numeric=0)
);
create index coffee_inventory_user on public.coffee_inventory(user_id);
create index coffee_inventory_capsule on public.coffee_inventory(capsule_id,user_id);
create unique index coffee_inventory_one_opening on public.coffee_inventory(user_id,capsule_id) where data->>'type'='opening';
alter table public.coffee_inventory enable row level security;
revoke all on public.coffee_inventory from public,anon,authenticated;
grant select,insert on public.coffee_inventory to authenticated;
create policy coffee_inventory_read on public.coffee_inventory for select to authenticated using(user_id=(select auth.uid()));
create policy coffee_inventory_insert on public.coffee_inventory for insert to authenticated with check(user_id=(select auth.uid()) and data->>'type'<>'tasting');

create function coffee_private.inventory_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tg_op<>'INSERT' then raise exception 'Bestandsbewegungen sind unveränderlich. Bitte eine Korrektur buchen.';end if;
 if not exists(select 1 from public.coffee_capsules where id=(new.data->>'capsule_id')::uuid and user_id=new.user_id) then raise exception 'Unbekannte Kaffeesorte';end if;
 if new.data->>'type'<>'opening' and not exists(select 1 from public.coffee_inventory where capsule_id=(new.data->>'capsule_id')::uuid and user_id=new.user_id and data->>'type'='opening') then raise exception 'Bitte zuerst den Anfangsbestand erfassen';end if;
 new.updated_at=clock_timestamp();return new;end;$$;
revoke all on function coffee_private.inventory_guard() from public;
create trigger coffee_inventory_guard before insert or update or delete on public.coffee_inventory for each row execute function coffee_private.inventory_guard();

-- Privilege elevation is limited to ledger insertion from a tasting owned by the caller.
create function coffee_private.tasting_inventory() returns trigger language plpgsql security definer set search_path='' as $$
declare old_amount integer:=0;new_amount integer:=0;begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Keine Berechtigung zur Verbrauchsbuchung';end if;
 if tg_op='UPDATE' and not old.deleted then old_amount=coalesce((old.data->>'consumed')::integer,0);end if;
 if not new.deleted then new_amount=coalesce((new.data->>'consumed')::integer,0);end if;
 if tg_op='UPDATE' and old_amount=new_amount and old.capsule_id=new.capsule_id then return new;end if;
 if old_amount>0 then insert into public.coffee_inventory(id,user_id,data) values(gen_random_uuid(),new.user_id,jsonb_build_object('capsule_id',old.capsule_id,'amount',old_amount,'type','tasting','note','Verbrauch korrigiert','tasting_id',new.id,'tasting_version',new.version));end if;
 if new_amount>0 then insert into public.coffee_inventory(id,user_id,data) values(gen_random_uuid(),new.user_id,jsonb_build_object('capsule_id',new.capsule_id,'amount',-new_amount,'type','tasting','note','Verkostung','tasting_id',new.id,'tasting_version',new.version));end if;
 return new;end;$$;
revoke all on function coffee_private.tasting_inventory() from public;
create trigger coffee_tasting_inventory after insert or update on public.coffee_tastings for each row execute function coffee_private.tasting_inventory();

-- Extend the existing RPC without changing its wire contract for older clients.
create or replace function public.coffee_save_record(p_kind text,p_id uuid,p_data jsonb,p_expected integer,p_deleted boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;tbl text;begin
 if auth.uid() is null then raise exception 'Anmeldung erforderlich';end if;
 if p_kind not in ('capsules','tastings','photos','inventory') or p_expected<0 then raise exception 'Ungültiger Datensatz';end if;
 if p_kind='inventory' and (p_expected<>0 or p_deleted or p_data->>'type'='tasting') then raise exception 'Bestandsbewegungen können nur neu gebucht werden';end if;
 tbl='coffee_'||p_kind;
 if p_expected=0 then
  begin execute format('insert into public.%I(id,user_id,data,version,deleted) values($1,$2,$3,1,$4) returning to_jsonb(%I.*)',tbl,tbl) into result using p_id,auth.uid(),p_data,p_deleted;
  exception when unique_violation then
   execute format('select to_jsonb(t.*) from public.%I t where id=$1 and user_id=$2 and data=$3 and deleted=$4',tbl) into result using p_id,auth.uid(),p_data,p_deleted;
   if result is null then raise exception 'Versionskonflikt' using errcode='40001';end if;
  end;
 else
  execute format('update public.%I set data=$1,version=version+1,deleted=$2 where id=$3 and user_id=$4 and version=$5 returning to_jsonb(%I.*)',tbl,tbl) into result using p_data,p_deleted,p_id,auth.uid(),p_expected;
  if result is null then
   execute format('select to_jsonb(t.*) from public.%I t where id=$1 and user_id=$2 and data=$3 and deleted=$4 and version=$5+1',tbl) into result using p_id,auth.uid(),p_data,p_deleted,p_expected;
   if result is null then raise exception 'Versionskonflikt' using errcode='40001';end if;
  end if;
 end if;
 if p_kind='tastings' then
  result=result||jsonb_build_object('_inventory',coalesce((select jsonb_agg(to_jsonb(i.*)) from public.coffee_inventory i where i.user_id=auth.uid() and i.data->>'tasting_id'=p_id::text),'[]'::jsonb));
 end if;
 return result;
end;$$;

-- Private, atomic quotas. Only the Edge Function's service role can reserve a request.
create table coffee_private.discovery_usage(day date not null,user_id uuid not null references auth.users(id) on delete cascade,mode text not null check(mode in ('ai','barcode','shop')),requests integer not null default 0,primary key(day,user_id,mode));
alter table coffee_private.discovery_usage enable row level security;
revoke all on coffee_private.discovery_usage from public,anon,authenticated;
create function coffee_private.reserve_discovery(p_user uuid,p_mode text) returns void language plpgsql security definer set search_path='' as $$
declare d date:=(now() at time zone 'UTC')::date;own_count integer;total integer;begin
 if p_mode not in ('ai','barcode','shop') or not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then raise exception 'Bestätigtes Konto erforderlich';end if;
 perform pg_advisory_xact_lock(722643,1);
 select coalesce(sum(requests),0) into own_count from coffee_private.discovery_usage where day=d and user_id=p_user and mode=p_mode;
 select coalesce(sum(requests),0) into total from coffee_private.discovery_usage where day=d and mode=p_mode;
 if own_count>=(case when p_mode='ai' then 10 else 100 end) or total>=(case when p_mode='ai' then 50 else 1000 end) then raise exception 'Tageslimit erreicht. Bitte morgen erneut versuchen.';end if;
 insert into coffee_private.discovery_usage(day,user_id,mode,requests) values(d,p_user,p_mode,1) on conflict(day,user_id,mode) do update set requests=coffee_private.discovery_usage.requests+1;
end;$$;
revoke all on function coffee_private.reserve_discovery(uuid,text) from public,anon,authenticated;
grant usage on schema coffee_private to service_role;
grant execute on function coffee_private.reserve_discovery(uuid,text) to service_role;
create function public.coffee_reserve_discovery(p_user uuid,p_mode text) returns void language sql security invoker set search_path='' as $$select coffee_private.reserve_discovery(p_user,p_mode);$$;
revoke all on function public.coffee_reserve_discovery(uuid,text) from public,anon,authenticated;
grant execute on function public.coffee_reserve_discovery(uuid,text) to service_role;

-- Product metadata remains optional, while barcode assignments are unique within one collection.
create function coffee_private.normalized_barcode(value text) returns text language plpgsql immutable security invoker set search_path='' as $$
declare code text:=regexp_replace(value,'[[:space:]-]','','g');total integer:=0;i integer;begin
 if code !~ '^(\d{8}|\d{12}|\d{13})$' then raise exception 'Ungültiges Barcode-Format';end if;
 for i in 1..length(code)-1 loop total=total+substring(code from length(code)-i for 1)::integer*case when i%2=1 then 3 else 1 end;end loop;
 if (10-total%10)%10<>right(code,1)::integer then raise exception 'Ungültige Barcode-Prüfziffer';end if;
 return case when length(code)=12 then '0'||code else code end;end;$$;
revoke all on function coffee_private.normalized_barcode(text) from public,anon;
grant execute on function coffee_private.normalized_barcode(text) to authenticated;
create function coffee_private.capsule_metadata_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare code text;normalized jsonb:='[]'::jsonb;begin
 if new.data?'pack_size' and not(jsonb_typeof(new.data->'pack_size')='number' and (new.data->>'pack_size')::numeric between 1 and 10000 and (new.data->>'pack_size')::numeric=trunc((new.data->>'pack_size')::numeric)) then raise exception 'Ungültige Packungsgröße';end if;
 if new.data?'shop_url' and (new.data->>'shop_url' !~ '^https://[^[:space:]]+$' or length(new.data->>'shop_url')>2000) then raise exception 'Ungültiger Kauflink';end if;
 if new.data?'barcodes' then
  if jsonb_typeof(new.data->'barcodes')<>'array' or jsonb_array_length(new.data->'barcodes')>20 then raise exception 'Ungültige Barcode-Liste';end if;
  perform pg_advisory_xact_lock(hashtext(new.user_id::text),17);
  for code in select jsonb_array_elements_text(new.data->'barcodes') loop
   code=coffee_private.normalized_barcode(code);
   if not new.deleted and exists(select 1 from public.coffee_capsules c where c.user_id=new.user_id and c.id<>new.id and not c.deleted and c.data->'barcodes' @> jsonb_build_array(code)) then raise exception 'Dieser Barcode ist bereits einer eigenen Sorte zugeordnet';end if;
   if not normalized @> jsonb_build_array(code) then normalized=normalized||jsonb_build_array(code);end if;
  end loop;
  new.data=jsonb_set(new.data,'{barcodes}',normalized);
 end if;
 return new;end;$$;
revoke all on function coffee_private.capsule_metadata_guard() from public;
create trigger coffee_capsule_metadata before insert or update on public.coffee_capsules for each row execute function coffee_private.capsule_metadata_guard();

-- Shared reviews omit consumption; stock details must not leak through JSON fields.
drop policy coffee_read on public.coffee_tastings;
create policy coffee_read on public.coffee_tastings for select to authenticated using(user_id=(select auth.uid()));
create function coffee_private.shared_tastings(p_owner uuid) returns setof jsonb language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not (p_owner=auth.uid() or exists(select 1 from public.coffee_shares where owner_id=p_owner and viewer_id=auth.uid())) then return;end if;
 return query select jsonb_build_object('id',t.id,'user_id',t.user_id,'data',t.data-'consumed','version',t.version,'deleted',t.deleted,'updated_at',t.updated_at) from public.coffee_tastings t where t.user_id=p_owner and not t.deleted order by t.id;
end;$$;
revoke all on function coffee_private.shared_tastings(uuid) from public,anon;
grant execute on function coffee_private.shared_tastings(uuid) to authenticated;
create function public.coffee_shared_tastings(p_owner uuid) returns setof jsonb language sql security invoker set search_path='' as $$select * from coffee_private.shared_tastings(p_owner);$$;
revoke all on function public.coffee_shared_tastings(uuid) from public,anon;
grant execute on function public.coffee_shared_tastings(uuid) to authenticated;

-- Explicit denial documents the private counter's access policy; the server reservation function owns writes.
create policy coffee_usage_no_client_access on coffee_private.discovery_usage for all to authenticated using(false) with check(false);
