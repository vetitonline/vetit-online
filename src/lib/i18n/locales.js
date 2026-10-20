// English default plus India's 22 scheduled languages. This is a locale
// registry, not a claim that reviewed translations exist for every language.
// Registry source: https://rajbhasha.gov.in/en/languages-included-eighth-schedule-indian-constitution
export const INDIAN_LANGUAGE_CODES=Object.freeze(['en','as','bn','brx','doi','gu','hi','kn','ks','kok','mai','ml','mni','mr','ne','or','pa','sa','sat','sd','ta','te','ur']);
const rtl=new Set(['ks','sd','ur']);
const tag=value=>typeof value==='string'&&/^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i.test(value.trim())?value.trim().replace(/_/g,'-').toLowerCase():null;
/** Additional approved regional codes and reviewed translation keys may be
 * supplied without changing global state. Unknown/missing copy falls to English. */
export function resolveIndianLocale(value='en',translatedLanguages=['en','hi'],additionalLanguages=[]){
 const allowed=new Set([...INDIAN_LANGUAGE_CODES,...additionalLanguages.filter(code=>typeof code==='string'&&/^[a-z]{2,3}$/.test(code))]);
 const input=tag(value),base=input?.split('-')[0];const requested=input&&allowed.has(base)?input:'en';
 const translated=new Set(translatedLanguages.map(tag).filter(Boolean));
 const script=requested.split('-').find(part=>/^[a-z]{4}$/.test(part));
 const scriptLanguage=script?`${requested.split('-')[0]}-${script}`:null;
 const language=translated.has(requested)?requested:scriptLanguage&&translated.has(scriptLanguage)?scriptLanguage:!script&&translated.has(requested.split('-')[0])?requested.split('-')[0]:'en';
 const contentBase=language.split('-')[0],contentScript=language.split('-').find(part=>/^[a-z]{4}$/.test(part));
 // Reviewed explicit scripts take precedence over a language's default script.
 // For example, Latin-script Kashmiri must not inherit Arabic-script direction.
 const direction=contentScript?(contentScript==='arab'?'rtl':'ltr'):rtl.has(contentBase)?'rtl':'ltr';
 const hasRegion=language.split('-').slice(1).some(part=>/^(?:[a-z]{2}|\d{3})$/.test(part));
 return{requestedLanguage:requested,language,contentLanguage:contentBase,locale:hasRegion?language:`${language}-IN`,direction,fallback:language==='en'&&requested.split('-')[0]!=='en'};
}
