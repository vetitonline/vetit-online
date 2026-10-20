param(
  [Parameter(Mandatory=$true)][ValidatePattern('^vetit_disposable_corrections_[0-9_]+$')][string]$Database,
  [Parameter(Mandatory=$true)][string]$Psql,
  [Parameter(Mandatory=$true)][string]$SqlFile,
  [Parameter(Mandatory=$true)][string]$LogFile
)
# Local synthetic validation only. Supply credentials through local authentication.
# This script never reads, prints or logs a credential file.
$ErrorActionPreference='Stop'
function Invoke-LocalSql([string]$Target,[string[]]$ExtraArgs) {
  & $Psql -X -w -h 127.0.0.1 -p 55432 -U vetit_test_admin -d $Target -v ON_ERROR_STOP=1 @ExtraArgs
  if ($LASTEXITCODE -ne 0) { throw "Local PostgreSQL validation failed for $Target" }
}
node (Join-Path $PSScriptRoot 'release-corrections-sql.mjs') $SqlFile
if ($LASTEXITCODE -ne 0) { throw 'Source manifest or SQL generation failed' }
$exists=Invoke-LocalSql 'postgres' @('-A','-t','-c',"select count(*) from pg_database where datname='$Database';")
if (($exists | Out-String).Trim() -ne '0') { throw 'Refusing to reuse an existing database' }
Invoke-LocalSql 'postgres' @('-c',"create database `"$Database`";")
$empty=Invoke-LocalSql $Database @('-A','-t','-c',"select count(*) from information_schema.tables where table_schema in ('public','auth','storage','vetit_appointments');")
if (($empty | Out-String).Trim() -ne '0') { throw 'New database is not empty' }
Invoke-LocalSql $Database @('-f',$SqlFile) 2>&1 | Tee-Object -FilePath $LogFile
# Both success and failure preserve the new database. No reset/drop/cleanup.
