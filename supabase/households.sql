-- v3: household scopes retain private records and personal review authorship.
create table public.coffee_households(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 80),owner_id uuid not null references auth.users(id),created_at timestamptz not null default now());
create table public.coffee_household_members(household_id uuid not null references public.coffee_households(id),user_id uuid not null references auth.users(id),joined_at timestamptz not null default now(),primary key(household_id,user_id));
create index coffee_household_member_user on public.coffee_household_members(user_id);
create table public.coffee_household_invitations(id uuid primary key default gen_random_uuid(),household_id uuid not null references public.coffee_households(id),viewer_id uuid not null references auth.users(id),viewer_email text not null,created_at timestamptz not null default now(),unique(household_id,viewer_id));
create index coffee_household_invitation_viewer on public.coffee_household_invitations(viewer_id);
create function coffee_private.is_member(h uuid) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.coffee_household_members where household_id=h and user_id=auth.uid());$$;
create function coffee_private.is_owner(h uuid) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.coffee_households where id=h and owner_id=auth.uid());$$;
revoke all on function coffee_private.is_member(uuid),coffee_private.is_owner(uuid) from public,anon;
grant execute on function coffee_private.is_member(uuid),coffee_private.is_owner(uuid) to authenticated;
alter table public.coffee_households enable row level security;
alter table public.coffee_household_members enable row level security;
alter table public.coffee_household_invitations enable row level security;
revoke all on public.coffee_households,public.coffee_household_members,public.coffee_household_invitations from public,anon,authenticated;
grant select on public.coffee_households,public.coffee_household_members,public.coffee_household_invitations to authenticated;
create policy household_read on public.coffee_households for select to authenticated using(coffee_private.is_member(id));
create policy household_member_read on public.coffee_household_members for select to authenticated using(coffee_private.is_member(household_id));
create policy household_invitation_read on public.coffee_household_invitations for select to authenticated using(viewer_id=(select auth.uid()) or coffee_private.is_owner(household_id));

do $$declare t text;begin foreach t in array array['capsules','tastings','photos','inventory'] loop
 execute format('alter table public.coffee_%I add column household_id uuid references public.coffee_households(id)',t);
 execute format('create index on public.coffee_%I(household_id)',t);
 end loop;end;$$;
alter table public.coffee_tastings drop constraint coffee_tastings_capsule_id_user_id_fkey;
alter table public.coffee_tastings add foreign key(capsule_id) references public.coffee_capsules(id);
alter table public.coffee_inventory drop constraint coffee_inventory_capsule_id_user_id_fkey;
alter table public.coffee_inventory add foreign key(capsule_id) references public.coffee_capsules(id);
drop index public.coffee_inventory_one_opening;
create unique index coffee_inventory_one_opening on public.coffee_inventory(capsule_id) where data->>'type'='opening';

create table public.coffee_preferences(id uuid primary key,user_id uuid not null references auth.users(id),household_id uuid not null references public.coffee_households(id),data jsonb not null,version integer not null default 1,deleted boolean not null default false,updated_at timestamptz not null default now(),capsule_id uuid generated always as ((data->>'capsule_id')::uuid) stored not null references public.coffee_capsules(id),unique(user_id,capsule_id),check(coalesce(jsonb_typeof(data->'favorite')='boolean',false)));
create index coffee_preferences_household on public.coffee_preferences(household_id);
alter table public.coffee_preferences enable row level security;
revoke all on public.coffee_preferences from public,anon,authenticated;
grant select,insert,update on public.coffee_preferences to authenticated;
create policy preference_read on public.coffee_preferences for select to authenticated using(user_id=(select auth.uid()) and coffee_private.is_member(household_id));
create policy preference_insert on public.coffee_preferences for insert to authenticated with check(user_id=(select auth.uid()) and coffee_private.is_member(household_id));
create policy preference_update on public.coffee_preferences for update to authenticated using(user_id=(select auth.uid()) and coffee_private.is_member(household_id)) with check(user_id=(select auth.uid()) and coffee_private.is_member(household_id));

-- Public profile sharing applies only to explicitly private records, never to household data.
drop policy coffee_read on public.coffee_capsules;
create policy coffee_read on public.coffee_capsules for select to authenticated using((household_id is not null and coffee_private.is_member(household_id)) or (household_id is null and (user_id=(select auth.uid()) or (not deleted and exists(select 1 from public.coffee_shares s where s.owner_id=user_id and s.viewer_id=(select auth.uid()))))));
drop policy coffee_read on public.coffee_tastings;
create policy coffee_read on public.coffee_tastings for select to authenticated using((household_id is null and user_id=(select auth.uid())) or (household_id is not null and coffee_private.is_member(household_id)));
drop policy coffee_read on public.coffee_photos;
create policy coffee_read on public.coffee_photos for select to authenticated using((household_id is not null and coffee_private.is_member(household_id)) or (household_id is null and (user_id=(select auth.uid()) or (not deleted and exists(select 1 from public.coffee_shares s where s.owner_id=user_id and s.viewer_id=(select auth.uid()))))));
drop policy coffee_inventory_read on public.coffee_inventory;
create policy coffee_inventory_read on public.coffee_inventory for select to authenticated using((household_id is null and user_id=(select auth.uid())) or (household_id is not null and coffee_private.is_member(household_id)));

do $$declare t text;begin foreach t in array array['capsules','tastings','photos'] loop
 execute format('drop policy coffee_insert on public.coffee_%I',t);
 execute format('create policy coffee_insert on public.coffee_%I for insert to authenticated with check(user_id=(select auth.uid()) and (household_id is null or coffee_private.is_member(household_id)))',t);
 execute format('drop policy coffee_update on public.coffee_%I',t);
 if t='capsules' then
  execute format('create policy coffee_update on public.coffee_%I for update to authenticated using((household_id is null and user_id=(select auth.uid())) or (household_id is not null and coffee_private.is_member(household_id))) with check((household_id is null and user_id=(select auth.uid())) or (household_id is not null and coffee_private.is_member(household_id)))',t);
 else
  execute format('create policy coffee_update on public.coffee_%I for update to authenticated using(user_id=(select auth.uid()) and (household_id is null or coffee_private.is_member(household_id))) with check(user_id=(select auth.uid()) and (household_id is null or coffee_private.is_member(household_id)))',t);
 end if;end loop;end;$$;
drop policy coffee_inventory_insert on public.coffee_inventory;
create policy coffee_inventory_insert on public.coffee_inventory for insert to authenticated with check(user_id=(select auth.uid()) and data->>'type'<>'tasting' and (household_id is null or coffee_private.is_member(household_id)));

create or replace function coffee_private.record_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare parent_scope uuid;parent_owner uuid;begin
 if tg_op='UPDATE' then
  if new.id<>old.id or new.user_id<>old.user_id or new.household_id is distinct from old.household_id then raise exception 'Autor, ID und Bereich dürfen nicht geändert werden';end if;
  if new.version<>old.version+1 then raise exception 'Versionskonflikt' using errcode='40001';end if;
 else if new.version<>1 then raise exception 'Ungültige Erstversion';end if;end if;
 if new.household_id is not null and not coffee_private.is_member(new.household_id) then raise exception 'Kein Zugriff auf diesen Haushalt' using errcode='42501';end if;
 if tg_table_name='coffee_capsules' and new.household_id is not null then
  new.data=jsonb_set(new.data,'{favorite}','false');
  if new.deleted and not coffee_private.is_owner(new.household_id) then raise exception 'Nur die Haushaltsverwaltung darf Sorten archivieren';end if;
 end if;
 if tg_table_name in ('coffee_tastings','coffee_preferences') then
  select household_id,user_id into parent_scope,parent_owner from public.coffee_capsules where id=(new.data->>'capsule_id')::uuid and (not deleted or new.deleted);
  if not found or parent_scope is distinct from new.household_id or (parent_scope is null and parent_owner<>new.user_id) then raise exception 'Kaffeesorte gehört nicht zu diesem Bereich';end if;
 end if;
 if tg_table_name='coffee_photos' and not new.deleted then
  select household_id,user_id into parent_scope,parent_owner from public.coffee_capsules where id=(new.data->>'parent_id')::uuid and not deleted;
  if not found then select household_id,user_id into parent_scope,parent_owner from public.coffee_tastings where id=(new.data->>'parent_id')::uuid and not deleted; if not found or parent_owner<>new.user_id then raise exception 'Fotos einer Verkostung gehören ihrem Autor';end if;end if;
  if parent_scope is distinct from new.household_id or (parent_scope is null and parent_owner<>new.user_id) then raise exception 'Foto gehört nicht zu diesem Bereich';end if;
 end if;
 new.updated_at=clock_timestamp();return new;
end;$$;
create trigger coffee_preference_guard before insert or update on public.coffee_preferences for each row execute function coffee_private.record_guard();

create or replace function coffee_private.inventory_guard() returns trigger language plpgsql security invoker set search_path='' as $$declare c public.coffee_capsules;begin
 if tg_op<>'INSERT' then raise exception 'Bestandsbewegungen sind unveränderlich. Bitte eine Korrektur buchen.';end if;
 select * into c from public.coffee_capsules where id=(new.data->>'capsule_id')::uuid;
 if not found or c.household_id is distinct from new.household_id or (c.household_id is null and c.user_id<>new.user_id) then raise exception 'Bestand gehört nicht zu diesem Bereich';end if;
 if new.household_id is not null and not coffee_private.is_member(new.household_id) then raise exception 'Kein Zugriff auf diesen Haushalt';end if;
 -- Lock the product for ordering opening balances, transfers and concurrent consumption.
 perform pg_advisory_xact_lock(hashtext(c.id::text),41);
 if new.data->>'type'<>'opening' and not exists(select 1 from public.coffee_inventory where capsule_id=c.id and data->>'type'='opening') then raise exception 'Bitte zuerst den Anfangsbestand erfassen';end if;
 new.updated_at=clock_timestamp();return new;end;$$;
create or replace function coffee_private.tasting_inventory() returns trigger language plpgsql security definer set search_path='' as $$declare old_amount integer:=0;new_amount integer:=0;begin
 if auth.uid() is null or new.user_id<>auth.uid() or (new.household_id is not null and not coffee_private.is_member(new.household_id)) then raise exception 'Keine Berechtigung zur Verbrauchsbuchung';end if;
 if tg_op='UPDATE' and not old.deleted then old_amount=coalesce((old.data->>'consumed')::integer,0);end if;
 if not new.deleted then new_amount=coalesce((new.data->>'consumed')::integer,0);end if;
 if tg_op='UPDATE' and old_amount=new_amount and old.capsule_id=new.capsule_id then return new;end if;
 if old_amount>0 then insert into public.coffee_inventory(id,user_id,household_id,data) values(gen_random_uuid(),new.user_id,new.household_id,jsonb_build_object('capsule_id',old.capsule_id,'amount',old_amount,'type','tasting','note','Verbrauch korrigiert','tasting_id',new.id,'tasting_version',new.version));end if;
 if new_amount>0 then insert into public.coffee_inventory(id,user_id,household_id,data) values(gen_random_uuid(),new.user_id,new.household_id,jsonb_build_object('capsule_id',new.capsule_id,'amount',-new_amount,'type','tasting','note','Verkostung','tasting_id',new.id,'tasting_version',new.version));end if;return new;end;$$;

-- Barcode uniqueness now follows a collection (private user or household), not its creator.
create or replace function coffee_private.capsule_metadata_guard() returns trigger language plpgsql security invoker set search_path='' as $$declare code text;normalized jsonb:='[]'::jsonb;begin
 if new.data?'pack_size' and not(jsonb_typeof(new.data->'pack_size')='number' and (new.data->>'pack_size')::numeric between 1 and 10000 and (new.data->>'pack_size')::numeric=trunc((new.data->>'pack_size')::numeric)) then raise exception 'Ungültige Packungsgröße';end if;
 if new.data?'shop_url' and (new.data->>'shop_url' !~ '^https://[^[:space:]]+$' or length(new.data->>'shop_url')>2000) then raise exception 'Ungültiger Kauflink';end if;
 if new.data?'barcodes' then
  if jsonb_typeof(new.data->'barcodes')<>'array' or jsonb_array_length(new.data->'barcodes')>20 then raise exception 'Ungültige Barcode-Liste';end if;
  perform pg_advisory_xact_lock(hashtext(coalesce(new.household_id,new.user_id)::text),17);
  for code in select jsonb_array_elements_text(new.data->'barcodes') loop
   code=coffee_private.normalized_barcode(code);
   if not new.deleted and exists(select 1 from public.coffee_capsules c where c.household_id is not distinct from new.household_id and (new.household_id is not null or c.user_id=new.user_id) and c.id<>new.id and not c.deleted and c.data->'barcodes' @> jsonb_build_array(code)) then raise exception 'Dieser Barcode ist bereits einer Sorte in diesem Bereich zugeordnet';end if;
   if not normalized @> jsonb_build_array(code) then normalized=normalized||jsonb_build_array(code);end if;
  end loop;new.data=jsonb_set(new.data,'{barcodes}',normalized);end if;return new;end;$$;

-- Keep older private clients compatible; new clients send the immutable scope explicitly.
drop function public.coffee_save_record(text,uuid,jsonb,integer,boolean);
create function public.coffee_save_record(p_kind text,p_id uuid,p_data jsonb,p_expected integer,p_deleted boolean default false,p_household uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;existing jsonb;tbl text;begin
 if auth.uid() is null then raise exception 'Anmeldung erforderlich';end if;
 if p_kind not in ('capsules','tastings','photos','inventory','preferences') or p_expected<0 then raise exception 'Ungültiger Datensatz';end if;
 if p_household is not null and not coffee_private.is_member(p_household) then raise exception 'Kein Zugriff auf diesen Haushalt' using errcode='42501';end if;
 if p_kind='inventory' and (p_expected<>0 or p_deleted or p_data->>'type'='tasting') then raise exception 'Bestandsbewegungen können nur neu gebucht werden';end if;
 if p_kind='capsules' and p_household is not null then p_data=jsonb_set(p_data,'{favorite}','false');end if;
 tbl='coffee_'||p_kind;
 execute format('select to_jsonb(t.*) from public.%I t where id=$1',tbl) into existing using p_id;
 if existing is not null then
  if (existing->>'household_id')::uuid is distinct from p_household then raise exception 'Bereich stimmt nicht überein. Bitte App aktualisieren.';end if;
  if (existing->>'user_id')::uuid<>auth.uid() and p_kind<>'capsules' then raise exception 'Nur eigene Einträge dürfen geändert werden' using errcode='42501';end if;
 end if;
 if p_expected=0 then
  begin execute format('insert into public.%I(id,user_id,household_id,data,version,deleted) values($1,$2,$3,$4,1,$5) returning to_jsonb(%I.*)',tbl,tbl) into result using p_id,auth.uid(),p_household,p_data,p_deleted;
  exception when unique_violation then
   execute format('select to_jsonb(t.*) from public.%I t where id=$1 and data=$2 and deleted=$3',tbl) into result using p_id,p_data,p_deleted;
   if result is null then raise exception 'Versionskonflikt' using errcode='40001';end if;end;
 else
  execute format('update public.%I set data=$1,version=version+1,deleted=$2 where id=$3 and version=$4 returning to_jsonb(%I.*)',tbl,tbl) into result using p_data,p_deleted,p_id,p_expected;
  if result is null then
   execute format('select to_jsonb(t.*) from public.%I t where id=$1 and data=$2 and deleted=$3 and version=$4+1',tbl) into result using p_id,p_data,p_deleted,p_expected;
   if result is null then raise exception 'Versionskonflikt' using errcode='40001';end if;end if;
 end if;
 if p_kind='tastings' then result=result||jsonb_build_object('_inventory',coalesce((select jsonb_agg(to_jsonb(i.*)) from public.coffee_inventory i where i.data->>'tasting_id'=p_id::text),'[]'::jsonb));end if;
 return result;end;$$;
revoke all on function public.coffee_save_record(text,uuid,jsonb,integer,boolean,uuid) from public,anon;
grant execute on function public.coffee_save_record(text,uuid,jsonb,integer,boolean,uuid) to authenticated;

-- Membership changes are online operations; invitations require explicit acceptance.
create function coffee_private.household_action(p_action text,p_household uuid default null,p_name text default null,p_email text default null,p_user uuid default null,p_invitation uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();h uuid;v uuid;i public.coffee_household_invitations;begin
 if me is null then raise exception 'Anmeldung erforderlich';end if;
 if p_action='create' then
  if not exists(select 1 from auth.users where id=me and email_confirmed_at is not null) then raise exception 'E-Mail zuerst bestätigen';end if;
  insert into public.coffee_households(name,owner_id) values(trim(p_name),me) returning id into h;
  insert into public.coffee_household_members values(h,me,now());return jsonb_build_object('id',h);
 elsif p_action in ('accept','decline') then
  select * into i from public.coffee_household_invitations where id=p_invitation and viewer_id=me for update;
  if not found then raise exception 'Einladung nicht mehr verfügbar';end if;
  if p_action='accept' then insert into public.coffee_household_members(household_id,user_id) values(i.household_id,me) on conflict do nothing;end if;
  delete from public.coffee_household_invitations where id=i.id;return jsonb_build_object('id',i.household_id);
 end if;
 select id into h from public.coffee_households where id=p_household for update;
 if h is null or not coffee_private.is_member(h) then raise exception 'Kein Zugriff auf diesen Haushalt';end if;
 if p_action='leave' then
  if coffee_private.is_owner(h) then raise exception 'Bitte zuerst die Haushaltsverwaltung an ein anderes Mitglied übertragen';end if;
  delete from public.coffee_household_members where household_id=h and user_id=me;return jsonb_build_object('id',h);
 end if;
 if not coffee_private.is_owner(h) then raise exception 'Nur die Haushaltsverwaltung darf diese Aktion ausführen';end if;
 if p_action='rename' then update public.coffee_households set name=trim(p_name) where id=h;
 elsif p_action='invite' then
  select id into v from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
  if v is null or v=me then raise exception 'Bitte die bestätigte E-Mail eines anderen registrierten Kontos verwenden';end if;
  if exists(select 1 from public.coffee_household_members where household_id=h and user_id=v) then raise exception 'Diese Person ist bereits Mitglied';end if;
  insert into public.coffee_household_invitations(household_id,viewer_id,viewer_email) values(h,v,lower(trim(p_email))) on conflict(household_id,viewer_id) do nothing;
 elsif p_action='remove' then
  if p_user=me then raise exception 'Die Haushaltsverwaltung muss zuerst übertragen werden';end if;
  delete from public.coffee_household_members where household_id=h and user_id=p_user;
 elsif p_action='transfer_owner' then
  if not exists(select 1 from public.coffee_household_members where household_id=h and user_id=p_user) then raise exception 'Bitte ein bestehendes Mitglied wählen';end if;
  update public.coffee_households set owner_id=p_user where id=h;
 elsif p_action='cancel_invitation' then delete from public.coffee_household_invitations where id=p_invitation and household_id=h;
 else raise exception 'Unbekannte Haushaltsaktion';end if;
 return jsonb_build_object('id',h);end;$$;
revoke all on function coffee_private.household_action(text,uuid,text,text,uuid,uuid) from public,anon;
grant execute on function coffee_private.household_action(text,uuid,text,text,uuid,uuid) to authenticated;
create function public.coffee_household_action(p_action text,p_household uuid default null,p_name text default null,p_email text default null,p_user uuid default null,p_invitation uuid default null) returns jsonb language sql security invoker set search_path='' as $$select coffee_private.household_action(p_action,p_household,p_name,p_email,p_user,p_invitation);$$;
revoke all on function public.coffee_household_action(text,uuid,text,text,uuid,uuid) from public,anon;
grant execute on function public.coffee_household_action(text,uuid,text,text,uuid,uuid) to authenticated;

create function coffee_private.household_state() returns jsonb language plpgsql security definer set search_path='' as $$declare me uuid:=auth.uid();begin
 if me is null then raise exception 'Anmeldung erforderlich';end if;
 return jsonb_build_object('households',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'name',h.name,'owner_id',h.owner_id,
 'members',(select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',p.display_name)) from public.coffee_household_members m join public.coffee_profiles p on p.id=m.user_id where m.household_id=h.id),
 'authors',(select jsonb_agg(jsonb_build_object('user_id',p.id,'name',p.display_name)) from public.coffee_profiles p where exists(select 1 from public.coffee_tastings t where t.household_id=h.id and t.user_id=p.id) or exists(select 1 from public.coffee_inventory i where i.household_id=h.id and i.user_id=p.id)),
 'invitations',case when h.owner_id=me then coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.viewer_email)) from public.coffee_household_invitations i where i.household_id=h.id),'[]'::jsonb) else '[]'::jsonb end)) from public.coffee_households h where exists(select 1 from public.coffee_household_members m where m.household_id=h.id and m.user_id=me)),'[]'::jsonb),
 'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'household_id',i.household_id,'name',h.name,'inviter',p.display_name)) from public.coffee_household_invitations i join public.coffee_households h on h.id=i.household_id join public.coffee_profiles p on p.id=h.owner_id where i.viewer_id=me),'[]'::jsonb));end;$$;
revoke all on function coffee_private.household_state() from public,anon;
grant execute on function coffee_private.household_state() to authenticated;
create function public.coffee_household_state() returns jsonb language sql security invoker set search_path='' as $$select coffee_private.household_state();$$;
revoke all on function public.coffee_household_state() from public,anon;
grant execute on function public.coffee_household_state() to authenticated;

-- An ordinary profile share never grants household access or exposes household reviews/photos.
create or replace function coffee_private.shared_tastings(p_owner uuid) returns setof jsonb language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not(p_owner=auth.uid() or exists(select 1 from public.coffee_shares where owner_id=p_owner and viewer_id=auth.uid())) then return;end if;
 return query select jsonb_build_object('id',t.id,'user_id',t.user_id,'household_id',null,'data',t.data-'consumed','version',t.version,'deleted',t.deleted,'updated_at',t.updated_at) from public.coffee_tastings t where t.user_id=p_owner and t.household_id is null and not t.deleted order by t.id;end;$$;
drop policy coffee_storage_read on storage.objects;
create policy coffee_storage_read on storage.objects for select to authenticated using(bucket_id='coffee-photos' and ((storage.foldername(name))[1]=(select auth.uid())::text or exists(select 1 from public.coffee_photos p where not p.deleted and p.data->>'path'=name and ((p.household_id is not null and coffee_private.is_member(p.household_id)) or (p.household_id is null and exists(select 1 from public.coffee_shares s where s.owner_id=p.user_id and s.viewer_id=(select auth.uid())))))));

-- Explicit, retry-safe import. Personal reviews remain private; consumption is transferred only once.
create table coffee_private.household_imports(id uuid primary key,user_id uuid not null references auth.users(id),source_id uuid not null references public.coffee_capsules(id),household_id uuid not null references public.coffee_households(id),result jsonb not null,unique(user_id,source_id,household_id));
alter table coffee_private.household_imports enable row level security;
revoke all on coffee_private.household_imports from public,anon,authenticated;
create policy household_import_no_client on coffee_private.household_imports for all to authenticated using(false) with check(false);
create function coffee_private.import_household(p_id uuid,p_source uuid,p_household uuid,p_target uuid default null,p_expected integer default null,p_move_stock boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();source public.coffee_capsules;target public.coffee_capsules;prior jsonb;amount integer;tracked boolean;new_tasting uuid;item record;parents jsonb:='{}'::jsonb;new_parent uuid;result jsonb;begin
 if me is null or not coffee_private.is_member(p_household) then raise exception 'Kein Zugriff auf diesen Haushalt';end if;
 perform pg_advisory_xact_lock(hashtext(p_source::text),42);
 select i.result into prior from coffee_private.household_imports i where i.user_id=me and i.source_id=p_source and i.household_id=p_household;
 if found then return prior;end if;
 select * into source from public.coffee_capsules where id=p_source and user_id=me and household_id is null and not deleted for update;
 if not found or (p_expected is not null and source.version<>p_expected) then raise exception 'Private Sorte nicht verfügbar oder inzwischen geändert. Bitte synchronisieren.';end if;
 if p_target is null then
  insert into public.coffee_capsules(id,user_id,household_id,data) values(gen_random_uuid(),me,p_household,jsonb_set(source.data,'{favorite}','false')) returning * into target;
 else
  select * into target from public.coffee_capsules where id=p_target and household_id=p_household and not deleted;
  if not found then raise exception 'Zielsorte gehört nicht zu diesem Haushalt';end if;
 end if;
 parents=jsonb_build_object(source.id::text,target.id);
 for item in select * from public.coffee_tastings where capsule_id=source.id and user_id=me and household_id is null and not deleted order by id loop
  new_tasting=gen_random_uuid();
  insert into public.coffee_tastings(id,user_id,household_id,data) values(new_tasting,me,p_household,(item.data||jsonb_build_object('capsule_id',target.id,'consumed',0,'source_tasting_id',item.id)));
  parents=parents||jsonb_build_object(item.id::text,new_tasting);
 end loop;
 for item in select * from public.coffee_photos where user_id=me and household_id is null and not deleted and parents?(data->>'parent_id') loop
  new_parent=(parents->>(item.data->>'parent_id'))::uuid;
  insert into public.coffee_photos(id,user_id,household_id,data) values(gen_random_uuid(),me,p_household,item.data||jsonb_build_object('parent_id',new_parent));
 end loop;
 if coalesce((source.data->>'favorite')::boolean,false) then insert into public.coffee_preferences(id,user_id,household_id,data) values(gen_random_uuid(),me,p_household,jsonb_build_object('capsule_id',target.id,'favorite',true)) on conflict(user_id,capsule_id) do nothing;end if;
 tracked=false;amount=0;
 if p_move_stock then
  -- Serialize against every other stock write in both source and destination.
  perform pg_advisory_xact_lock(hashtext(least(source.id::text,target.id::text)),41);
  perform pg_advisory_xact_lock(hashtext(greatest(source.id::text,target.id::text)),41);
  select exists(select 1 from public.coffee_inventory where capsule_id=source.id and data->>'type'='opening') into tracked;
  if tracked then
   select coalesce(sum((data->>'amount')::integer),0)::integer into amount from public.coffee_inventory where capsule_id=source.id;
   if amount<0 then raise exception 'Bitte den negativen privaten Bestand vor der Übernahme korrigieren';end if;
   if not exists(select 1 from public.coffee_inventory where capsule_id=target.id and data->>'type'='opening') then insert into public.coffee_inventory(id,user_id,household_id,data) values(gen_random_uuid(),me,p_household,jsonb_build_object('capsule_id',target.id,'amount',0,'type','opening','note','Haushaltsbestand aktiviert','threshold',5));end if;
   if amount>0 then
    insert into public.coffee_inventory(id,user_id,data) values(gen_random_uuid(),me,jsonb_build_object('capsule_id',source.id,'amount',-amount,'type','correction','note','In Haushalt übernommen'));
    insert into public.coffee_inventory(id,user_id,household_id,data) values(gen_random_uuid(),me,p_household,jsonb_build_object('capsule_id',target.id,'amount',amount,'type','purchase','note','Aus privatem Bestand übernommen'));
   end if;
  end if;
 end if;
 result=jsonb_build_object('capsule_id',target.id,'transferred',amount,'stock_tracked',tracked);
 insert into coffee_private.household_imports(id,user_id,source_id,household_id,result) values(p_id,me,source.id,p_household,result);
 return result;end;$$;
revoke all on function coffee_private.import_household(uuid,uuid,uuid,uuid,integer,boolean) from public,anon;
grant execute on function coffee_private.import_household(uuid,uuid,uuid,uuid,integer,boolean) to authenticated;
create function public.coffee_import_household(p_id uuid,p_source uuid,p_household uuid,p_target uuid default null,p_expected integer default null,p_move_stock boolean default true) returns jsonb language sql security invoker set search_path='' as $$select coffee_private.import_household(p_id,p_source,p_household,p_target,p_expected,p_move_stock);$$;
revoke all on function public.coffee_import_household(uuid,uuid,uuid,uuid,integer,boolean) from public,anon;
grant execute on function public.coffee_import_household(uuid,uuid,uuid,uuid,integer,boolean) to authenticated;

-- Uploaded photo bytes may be referenced in both private and household scopes after import.
create function coffee_private.can_delete_photo(p_path text) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and split_part(p_path,'/',1)=auth.uid()::text and not exists(select 1 from public.coffee_photos where not deleted and data->>'path'=p_path);$$;
revoke all on function coffee_private.can_delete_photo(text) from public,anon;
grant execute on function coffee_private.can_delete_photo(text) to authenticated;
create function public.coffee_can_delete_photo(p_path text) returns boolean language sql security invoker set search_path='' as $$select coffee_private.can_delete_photo(p_path);$$;
revoke all on function public.coffee_can_delete_photo(text) from public,anon;
grant execute on function public.coffee_can_delete_photo(text) to authenticated;
drop policy coffee_storage_delete on storage.objects;
create policy coffee_storage_delete on storage.objects for delete to authenticated using(bucket_id='coffee-photos' and coffee_private.can_delete_photo(name));

create index coffee_household_owner on public.coffee_households(owner_id);
create index coffee_preference_capsule on public.coffee_preferences(capsule_id);
create index coffee_household_import_source on coffee_private.household_imports(source_id);
create index coffee_household_import_house on coffee_private.household_imports(household_id);
