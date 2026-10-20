// Offline contract only. No environment/credential access, network or execution.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roles=['buyer','seller','provider','reviewer_readonly','reviewer_decision','outsider'];
const checks=['content','legal','images','credentials'];
function shape(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key))||keys.some(key=>!(key in value)))throw Error('Invalid synthetic acceptance configuration; values withheld.');}
const boolean=value=>typeof value==='boolean';
export function assessSyntheticAcceptance(plan,{now=Date.now()}={}){
 shape(plan,['projectRef','automaticApprovalEnabled','automaticPublicationEnabled','defaultLanguage','accounts','providers','prerequisites']);
 if(plan.projectRef!=='apfyfmokcynqiaxqvvxx'||plan.automaticApprovalEnabled!==false||plan.automaticPublicationEnabled!==false||plan.defaultLanguage!=='en'||!Array.isArray(plan.accounts)||plan.accounts.length!==roles.length||!Array.isArray(plan.providers)||plan.providers.length>12)throw Error('Unsafe synthetic acceptance configuration.');
 const blockers=new Set(),seenRoles=new Set(),seenProfiles=new Set(),seenProviders=new Set();
 const expiry=value=>{if(value===null)return false;const t=Date.parse(value);if(typeof value!=='string'||!Number.isFinite(t)||t<=now||t>now+86400000)throw Error('Scope expiry must be future and at most 24 hours.');return true;};
 for(const account of plan.accounts){
  shape(account,['role','profileId','syntheticOnly','claims','registeredReviewer','scopes']);
  shape(account.claims,['vetit_reviewer','vetit_admin']);
  const reviewer=account.role.startsWith?.('reviewer_');
  if(!roles.includes(account.role)||seenRoles.has(account.role)||account.syntheticOnly!==true||account.claims.vetit_admin!==false||account.claims.vetit_reviewer!==reviewer||!boolean(account.registeredReviewer)||!Array.isArray(account.scopes)||account.scopes.length>10)throw Error('Invalid synthetic identity or reviewer authority.');
  seenRoles.add(account.role);
  if(account.profileId===null)blockers.add('SYNTHETIC_PROFILE_MAPPING_REQUIRED');
  else if(!uuid.test(account.profileId)||seenProfiles.has(account.profileId))throw Error('Invalid or duplicate synthetic profile mapping.');
  else seenProfiles.add(account.profileId);
  if(!reviewer&&(account.registeredReviewer||account.scopes.length))throw Error('Non-reviewer must not receive review grants.');
  if(reviewer&&(!account.registeredReviewer||!account.scopes.length))blockers.add('SCOPED_REVIEWER_PROVISIONING_UNVERIFIED');
  const businesses=new Set();
  for(const scope of account.scopes){
   shape(scope,['businessId','capability','expiresAt']);
   if(scope.businessId===null)blockers.add('BUSINESS_MAPPING_REQUIRED');else if(!uuid.test(scope.businessId)||businesses.has(scope.businessId))throw Error('Invalid or duplicate business scope.');else businesses.add(scope.businessId);
   if(!['read','review'].includes(scope.capability)||account.role==='reviewer_readonly'&&scope.capability!=='read')throw Error('Unsupported acceptance capability; publication excluded.');
   if(!expiry(scope.expiresAt))blockers.add('SCOPE_EXPIRY_REQUIRED');
  }
  if(account.role==='reviewer_decision'&&!account.scopes.some(scope=>scope.capability==='review'))blockers.add('REVIEW_DECISION_SCOPE_REQUIRED');
 }
 for(const provider of plan.providers){
  shape(provider,['id','check','endpoint','businessId','expiresAt','languages','serverCredentialConfigured']);
  if(!/^[a-z][a-z0-9_-]{0,63}$/.test(provider.id)||seenProviders.has(provider.id)||!checks.includes(provider.check)||!Array.isArray(provider.languages)||!provider.languages.length||provider.languages.some(code=>typeof code!=='string'||!/^[a-z]{2,3}(?:-[A-Za-z]{4})?$/.test(code))||!boolean(provider.serverCredentialConfigured))throw Error('Invalid provider descriptor.');
  seenProviders.add(provider.id);
  if(provider.endpoint===null)blockers.add('PROVIDER_ENDPOINT_REQUIRED');else{let u;try{u=new URL(provider.endpoint);}catch{throw Error('Invalid provider endpoint.');}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('Unsafe provider endpoint.');}
  if(provider.businessId===null)blockers.add('PROVIDER_BUSINESS_REQUIRED');else if(!uuid.test(provider.businessId))throw Error('Invalid provider business scope.');
  if(!expiry(provider.expiresAt))blockers.add('PROVIDER_SCOPE_EXPIRY_REQUIRED');
  if(!provider.serverCredentialConfigured)blockers.add('SERVER_PROVIDER_CREDENTIAL_UNVERIFIED');
 }
 for(const check of checks)if(!plan.providers.some(provider=>provider.check===check))blockers.add('MANDATORY_PROVIDER_DESCRIPTOR_REQUIRED');
 const keys=['syntheticAuthentication','browserRunner','nativeSecureStorage','nativeCryptoUuid','nativeDevice','policyApproval','providerDataSharingApproval','hostedCandidateApproval'];shape(plan.prerequisites,keys);
 for(const key of keys){if(!boolean(plan.prerequisites[key]))throw Error('Invalid prerequisite declaration.');if(!plan.prerequisites[key])blockers.add('PENDING_'+key.replace(/[A-Z]/g,c=>'_'+c).toUpperCase());}
 return{contractValid:true,declaredPrerequisitesComplete:blockers.size===0,blockers:[...blockers].sort(),runtimeVerified:false,hostedExecutionAuthorized:false,defaultLanguage:'en',automaticPublicationEnabled:false};
}
