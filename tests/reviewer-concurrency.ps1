param([Parameter(Mandatory=$true)][ValidateSet('Setup','Hold','Conflicts','RevokeScope','DecisionScope','RevokeIdentity','DecisionIdentity','Assert')][string]$Stage)
$ErrorActionPreference='Stop'
$target='vetit_disposable_reviewer_concurrency_20261019'
$source='vetit_disposable_corrections_20261018_1302'
$profile='10000000-0000-4000-8000-000000000007'
$business='20000000-0000-4000-8000-000000000001'
$caseId='90000000-0000-4000-8000-000000000041'
$identity="select set_config('request.jwt.claim.sub','$profile',true);select set_config('request.jwt.claims','{`"app_metadata`":{`"vetit_reviewer`":true}}',true);"
function Invoke-ScopedSql([string]$Database,[string]$Body,[string]$Expected='') {
 $result=$Body | & 'D:\VetitTestTools\Postgres17\pgsql\bin\psql.exe' -X -w -q -A -t -h 127.0.0.1 -p 55432 -U vetit_test_admin -d $Database -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -f - 2>&1
 $code=$LASTEXITCODE
 if($Expected){if($code -eq 0 -or ($result|Out-String) -notmatch $Expected){throw 'Expected local permission/lock denial was absent.'};return}
 if($code -ne 0){throw 'Local PostgreSQL stage failed; no raw diagnostics disclosed.'}
 return ($result|Out-String).Trim()
}
function Wait-ScopedMarker([int]$Marker) {
 $waitSql='do $$begin for n in 1..60 loop if exists(select 1 from pg_locks where locktype=''advisory'' and objid=__MARKER__ and granted) then return;end if;perform pg_sleep(0.05);end loop;raise exception ''Synchronization timeout.'';end;$$;'
 $null=Invoke-ScopedSql $target ($waitSql.Replace('__MARKER__',$Marker.ToString()))
}
$savedPasswordScoped=$env:PGPASSWORD
$savedTimeoutScoped=$env:PGCONNECT_TIMEOUT
$savedOptionsScoped=$env:PGOPTIONS
try {
 $env:PGPASSWORD=[IO.File]::ReadAllLines('D:\VetitTestTools\Postgres17\appointment-test-private\test-password.txt')[0]
 $env:PGCONNECT_TIMEOUT='5'
 $env:PGOPTIONS='-c statement_timeout=20000 -c lock_timeout=3000'
 if($Stage -eq 'Setup') {
  $actual=Invoke-ScopedSql $source "select current_database()||'|'||current_user||'|'||host(inet_server_addr())||'|'||inet_server_port();"
  if($actual -ne "$source|vetit_test_admin|127.0.0.1|55432"){throw 'Wrong local source identity.'}
  if((Invoke-ScopedSql 'postgres' "select count(*) from pg_database where datname='$target';") -ne '0'){throw 'Existing database preserved; setup refused.'}
  $null=Invoke-ScopedSql 'postgres' "create database $target template $source;"
  $proposal=[IO.File]::ReadAllText((Join-Path $PSScriptRoot '..\supabase\test-project\release-corrections\business-scoped-moderation.proposal.sql')) -replace '(?m)^begin;\s*$','' -replace '(?m)^commit;\s*$',''
  $setup=@"
begin;
set local statement_timeout='15s';
alter table auth.users add column if not exists raw_app_meta_data jsonb;
$proposal
update auth.users set raw_app_meta_data='{"vetit_reviewer":true}' where id='$profile';
insert into vetit_moderation.reviewers(profile_id,enabled) values('$profile',true) on conflict(profile_id) do update set enabled=true;
insert into vetit_moderation.reviewer_scopes(profile_id,business_id,can_read,can_review,enabled,expires_at) values('$profile','$business',true,true,true,clock_timestamp()+interval '1 hour');
insert into vetit_moderation.cases(id,subject_kind,subject_id,business_id,revision) values('$caseId','seller','$business','$business',vetit_moderation.fingerprint('seller','$business'));
commit;
"@
  $null=Invoke-ScopedSql $target $setup
 } else {
  $actual=Invoke-ScopedSql $target "select current_database()||'|'||current_user||'|'||host(inet_server_addr())||'|'||inet_server_port();"
  if($actual -ne "$target|vetit_test_admin|127.0.0.1|55432"){throw 'Wrong local target identity.'}
  switch($Stage) {
   'Hold' {$null=Invoke-ScopedSql $target "begin;set local statement_timeout='10s';$identity select vetit_moderation.require_scope('$business','review');select pg_advisory_xact_lock(992601001);select pg_sleep(3);rollback;"}
   'Conflicts' {Wait-ScopedMarker 992601001;Invoke-ScopedSql $target "set lock_timeout='250ms';update vetit_moderation.reviewer_scopes set enabled=false where profile_id='$profile' and business_id='$business';" '55P03';Invoke-ScopedSql $target "set lock_timeout='250ms';update auth.users set raw_app_meta_data='{}' where id='$profile';" '55P03'}
   'RevokeScope' {$null=Invoke-ScopedSql $target "begin;update vetit_moderation.reviewer_scopes set enabled=false where profile_id='$profile' and business_id='$business';select pg_advisory_xact_lock(992601002);select pg_sleep(2);commit;"}
   'DecisionScope' {Wait-ScopedMarker 992601002;Invoke-ScopedSql $target "begin;set local statement_timeout='8s';$identity select public.moderation_decide('$caseId',1,'reject',gen_random_uuid(),array['SYNTHETIC']);rollback;" '42501'}
   'RevokeIdentity' {$null=Invoke-ScopedSql $target "update vetit_moderation.reviewer_scopes set enabled=true where profile_id='$profile' and business_id='$business';begin;update auth.users set raw_app_meta_data='{}' where id='$profile';select pg_advisory_xact_lock(992601003);select pg_sleep(2);commit;"}
   'DecisionIdentity' {Wait-ScopedMarker 992601003;Invoke-ScopedSql $target "begin;set local statement_timeout='8s';$identity select public.moderation_decide('$caseId',1,'reject',gen_random_uuid(),array['SYNTHETIC']);rollback;" '42501'}
   'Assert' {$result=Invoke-ScopedSql $target "select state='pending' and version=1 and not exists(select 1 from vetit_moderation.events where case_id='$caseId') from vetit_moderation.cases where id='$caseId';";if($result -ne 't'){throw 'Denied decision changed state.'}}
  }
 }
 Write-Output "PASS $Stage (local clone preserved)"
} finally {$env:PGPASSWORD=$savedPasswordScoped;$env:PGCONNECT_TIMEOUT=$savedTimeoutScoped;$env:PGOPTIONS=$savedOptionsScoped}
