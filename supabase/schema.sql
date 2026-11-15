-- Kapselkompass v1. Apply once to an empty project via Supabase SQL Editor or migration.
create schema if not exists coffee_private;
revoke all on schema coffee_private from public;
grant usage on schema coffee_private to authenticated;

create table public.coffee_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default 'Kaffeeliebhaber' check(length(display_name) between 1 and 80)
);
create table public.coffee_shares (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.coffee_profiles(id) on delete cascade,
 viewer_id uuid not null references auth.users(id) on delete cascade,
 viewer_email text not null,
 created_at timestamptz not null default now(),
 unique(owner_id,viewer_id), check(owner_id<>viewer_id)
);
create index coffee_shares_viewer on public.coffee_shares(viewer_id);
alter table public.coffee_profiles enable row level security;
alter table public.coffee_shares enable row level security;
create policy coffee_share_read on public.coffee_shares for select to authenticated using(owner_id=(select auth.uid()) or viewer_id=(select auth.uid()));
create policy coffee_share_revoke on public.coffee_shares for delete to authenticated using(owner_id=(select auth.uid()));
create policy coffee_profile_read on public.coffee_profiles for select to authenticated using(id=(select auth.uid()) or exists(select 1 from public.coffee_shares s where s.owner_id=coffee_profiles.id and s.viewer_id=(select auth.uid())));
create policy coffee_profile_update on public.coffee_profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
grant select,update on public.coffee_profiles to authenticated;
grant select,delete on public.coffee_shares to authenticated;

create function coffee_private.new_profile() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.coffee_profiles(id) values(new.id);return new;end;$$;
revoke all on function coffee_private.new_profile() from public;
create trigger coffee_profile_created after insert on auth.users for each row execute function coffee_private.new_profile();
insert into public.coffee_profiles(id) select id from auth.users on conflict do nothing;

create function coffee_private.invite(p_email text) returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_email text;begin
 if auth.uid() is null then raise exception 'Anmeldung erforderlich';end if;
 select id,email into v_id,v_email from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
 if v_id is null or v_id=auth.uid() then raise exception 'Freigabe nicht möglich. Bitte die bestätigte E-Mail-Adresse eines anderen registrierten Kontos verwenden.';end if;
 insert into public.coffee_shares(owner_id,viewer_id,viewer_email) values(auth.uid(),v_id,v_email) on conflict(owner_id,viewer_id) do nothing;
end;$$;
revoke all on function coffee_private.invite(text) from public;
grant execute on function coffee_private.invite(text) to authenticated;
create function public.coffee_invite(p_email text) returns void language sql security invoker set search_path='' as $$select coffee_private.invite(p_email);$$;
revoke all on function public.coffee_invite(text) from public;
grant execute on function public.coffee_invite(text) to authenticated;

create table public.coffee_capsules (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 data jsonb not null,
 version integer not null default 1 check(version>0),
 deleted boolean not null default false,
 updated_at timestamptz not null default now(),
 unique(id,user_id),
 check(jsonb_typeof(data)='object'),
 check(coalesce(length(trim(data->>'name')) between 1 and 120,false)),
 check(coalesce(length(trim(data->>'brand')) between 1 and 80,false)),
 check(coalesce(length(trim(data->>'system')) between 1 and 80,false)),
 check(coalesce(jsonb_typeof(data->'favorite')='boolean',false)),
 check(not(data?'price') or (data->>'price')::numeric>=0),
 check(not(data?'intensity') or (data->>'intensity')::integer between 1 and 20)
);
create table public.coffee_tastings (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 data jsonb not null,
 version integer not null default 1 check(version>0),
 deleted boolean not null default false,
 updated_at timestamptz not null default now(),
 capsule_id uuid generated always as ((data->>'capsule_id')::uuid) stored not null,
 foreign key(capsule_id,user_id) references public.coffee_capsules(id,user_id),
 unique(id,user_id),
 check(jsonb_typeof(data)='object'),
 check(coalesce((data->>'aroma')::numeric between 1 and 10 and (data->>'aroma')::numeric=trunc((data->>'aroma')::numeric),false)),
 check(coalesce((data->>'intensity')::numeric between 1 and 10 and (data->>'intensity')::numeric=trunc((data->>'intensity')::numeric),false)),
 check(coalesce((data->>'acidity')::numeric between 1 and 10 and (data->>'acidity')::numeric=trunc((data->>'acidity')::numeric),false)),
 check(coalesce((data->>'bitterness')::numeric between 1 and 10 and (data->>'bitterness')::numeric=trunc((data->>'bitterness')::numeric),false)),
 check(coalesce((data->>'body')::numeric between 1 and 10 and (data->>'body')::numeric=trunc((data->>'body')::numeric),false)),
 check(coalesce((data->>'overall')::numeric between 1 and 10 and (data->>'overall')::numeric=trunc((data->>'overall')::numeric),false)),
 check(coalesce(length(data->>'date')>0,false)),
 check(coalesce(length(data->>'method') between 1 and 80,false)),
 check(coalesce(data->>'rebuy' in ('yes','no','maybe'),false)),
 check(coalesce(jsonb_typeof(data->'tags')='array',false)),
 check(coalesce(length(data->>'notes')<=5000,false)),
 check(not(data?'water') or (data->>'water')::numeric between 1 and 2000)
);
create index coffee_tastings_capsule on public.coffee_tastings(capsule_id,user_id);
create table public.coffee_photos (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 data jsonb not null,
 version integer not null default 1 check(version>0),
 deleted boolean not null default false,
 updated_at timestamptz not null default now(),
 check(jsonb_typeof(data)='object'),
 check(coalesce(split_part(data->>'path','/',1)=user_id::text,false)),
 check(coalesce(length(data->>'parent_id')=36,false)),
 check(coalesce(length(data->>'caption')<=255,false))
);

do $$declare t text;begin
 foreach t in array array['capsules','tastings','photos'] loop
 execute format('alter table public.coffee_%I enable row level security',t);
 execute format('create index on public.coffee_%I(user_id)',t);
 execute format('grant select,insert,update on public.coffee_%I to authenticated',t);
 execute format('create policy coffee_read on public.coffee_%I for select to authenticated using(user_id=(select auth.uid()) or (not deleted and exists(select 1 from public.coffee_shares s where s.owner_id=user_id and s.viewer_id=(select auth.uid()))))',t);
 execute format('create policy coffee_insert on public.coffee_%I for insert to authenticated with check(user_id=(select auth.uid()))',t);
 execute format('create policy coffee_update on public.coffee_%I for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()))',t);
 end loop;
end;$$;
-- All mutations receive a server-owned version. Direct REST writes cannot bypass CAS.
create function coffee_private.record_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.id<>old.id or new.user_id<>old.user_id then raise exception 'Besitzer und ID dürfen nicht geändert werden';end if;
  if new.version<>old.version+1 then raise exception 'Versionskonflikt' using errcode='40001';end if;
 else
  if new.version<>1 then raise exception 'Ungültige Erstversion';end if;
 end if;
 if tg_table_name='coffee_tastings' and not new.deleted then
  if not exists(select 1 from public.coffee_capsules where id=(new.data->>'capsule_id')::uuid and user_id=new.user_id and not deleted) then raise exception 'Kaffeesorte wurde gelöscht oder ist nicht verfügbar';end if;
 end if;
 if tg_table_name='coffee_photos' and not new.deleted then
  if not exists(select 1 from public.coffee_capsules where id=(new.data->>'parent_id')::uuid and user_id=new.user_id and not deleted) and not exists(select 1 from public.coffee_tastings t join public.coffee_capsules c on c.id=t.capsule_id where t.id=(new.data->>'parent_id')::uuid and t.user_id=new.user_id and not t.deleted and not c.deleted) then raise exception 'Foto gehört zu keinem aktiven Eintrag';end if;
 end if;
 new.updated_at=clock_timestamp();return new;
end;$$;
revoke all on function coffee_private.record_guard() from public;
create trigger coffee_capsule_guard before insert or update on public.coffee_capsules for each row execute function coffee_private.record_guard();
create trigger coffee_tasting_guard before insert or update on public.coffee_tastings for each row execute function coffee_private.record_guard();
create trigger coffee_photo_guard before insert or update on public.coffee_photos for each row execute function coffee_private.record_guard();

create function public.coffee_save_record(p_kind text,p_id uuid,p_data jsonb,p_expected integer,p_deleted boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;tbl text;begin
 if auth.uid() is null then raise exception 'Anmeldung erforderlich';end if;
 if p_kind not in ('capsules','tastings','photos') or p_expected<0 then raise exception 'Ungültiger Datensatz';end if;
 tbl='coffee_'||p_kind;
 if p_expected=0 then
  begin execute format('insert into public.%I(id,user_id,data,version,deleted) values($1,$2,$3,1,$4) returning to_jsonb(%I.*)',tbl,tbl) into result using p_id,auth.uid(),p_data,p_deleted;
  exception when unique_violation then
   -- Retry after a lost response is idempotent if the remote content is identical.
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
 return result;
end;$$;
revoke all on function public.coffee_save_record(text,uuid,jsonb,integer,boolean) from public;
grant execute on function public.coffee_save_record(text,uuid,jsonb,integer,boolean) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('coffee-photos','coffee-photos',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy coffee_storage_read on storage.objects for select to authenticated using(bucket_id='coffee-photos' and ((storage.foldername(name))[1]=(select auth.uid())::text or exists(select 1 from public.coffee_photos p where not p.deleted and p.data->>'path'=name and exists(select 1 from public.coffee_shares s where s.owner_id=p.user_id and s.viewer_id=(select auth.uid())))));
create policy coffee_storage_insert on storage.objects for insert to authenticated with check(bucket_id='coffee-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy coffee_storage_update on storage.objects for update to authenticated using(bucket_id='coffee-photos' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='coffee-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy coffee_storage_delete on storage.objects for delete to authenticated using(bucket_id='coffee-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
