import {resolveIndianLocale} from '../i18n/locales.js';
const copy = {
  en: {
    orders: 'Your orders', ordersIntro: 'View saved order details and seller-provided tracking. No payment or delivery action is performed here.',
    loading: 'Loading…', empty: 'No orders yet.', signin: 'Sign in to view your orders.', notfound: 'Order not found for this account.', error: 'Orders are temporarily unavailable. Please retry.',
    retry: 'Retry', more: 'Load more', back: 'All orders', view: 'View order', date: 'Placed', total: 'Order total', subtotal: 'Items subtotal', delivery: 'Delivery', tax: 'Tax',
    items: 'Items at the saved order price', tracking: 'Seller-provided fulfilment updates', noTracking: 'No fulfilment updates have been recorded.', noItems: 'No item details were returned.',
    carrier: 'Carrier', reference: 'Tracking reference', shipped: 'Shipped', delivered: 'Delivered', partial: 'This order has more records than can be displayed. Contact the seller for the remaining details.',
    shop: 'Browse products', qty: 'Quantity', cart: 'Your cart', preview: 'Local preview only. Stock is not reserved.', checkout: 'Review checkout availability', unavailable: 'Checkout and payments are not enabled. No order will be placed.',
    unknownTotal: 'Delivery, tax and final total are not calculated.', remove: 'Remove', increase: 'Increase quantity', decrease: 'Decrease quantity', account: 'Orders and tracking online', options: 'Choose options online', unpriced: 'Price unavailable',
  },
  hi: {
    orders: 'आपके ऑर्डर', ordersIntro: 'सहेजे गए ऑर्डर और विक्रेता की ट्रैकिंग जानकारी देखें। यहाँ भुगतान या डिलीवरी की कोई कार्रवाई नहीं होती।',
    loading: 'लोड हो रहा है…', empty: 'अभी कोई ऑर्डर नहीं है।', signin: 'अपने ऑर्डर देखने के लिए लॉग इन करें।', notfound: 'इस खाते में यह ऑर्डर नहीं मिला।', error: 'ऑर्डर अभी उपलब्ध नहीं हैं। फिर कोशिश करें।',
    retry: 'फिर कोशिश करें', more: 'और देखें', back: 'सभी ऑर्डर', view: 'ऑर्डर देखें', date: 'ऑर्डर की तारीख', total: 'ऑर्डर का कुल मूल्य', subtotal: 'वस्तुओं का मूल्य', delivery: 'डिलीवरी', tax: 'कर',
    items: 'ऑर्डर के समय की कीमत पर वस्तुएँ', tracking: 'विक्रेता द्वारा दी गई डिलीवरी स्थिति', noTracking: 'डिलीवरी की कोई जानकारी दर्ज नहीं है।', noItems: 'वस्तुओं की जानकारी नहीं मिली।',
    carrier: 'डिलीवरी सेवा', reference: 'ट्रैकिंग संदर्भ', shipped: 'भेजा गया', delivered: 'पहुँचा दिया गया', partial: 'इस ऑर्डर की कुछ जानकारी यहाँ नहीं दिखाई जा सकती। बाकी जानकारी के लिए विक्रेता से संपर्क करें।',
    shop: 'उत्पाद देखें', qty: 'मात्रा', cart: 'आपकी कार्ट', preview: 'केवल स्थानीय पूर्वावलोकन। स्टॉक आरक्षित नहीं है।', checkout: 'चेकआउट की उपलब्धता देखें', unavailable: 'चेकआउट और भुगतान अभी उपलब्ध नहीं हैं। कोई ऑर्डर नहीं बनेगा।',
    unknownTotal: 'डिलीवरी, कर और अंतिम कुल मूल्य की गणना नहीं हुई है।', remove: 'हटाएँ', increase: 'मात्रा बढ़ाएँ', decrease: 'मात्रा घटाएँ', account: 'ऑर्डर और ट्रैकिंग ऑनलाइन', options: 'विकल्प ऑनलाइन चुनें', unpriced: 'कीमत उपलब्ध नहीं है',
  },
};
export function workspaceCopy(language = 'en') { return copy[resolveIndianLocale(language,Object.keys(copy)).language]; }
const statuses = {
  pending: ['Pending', 'लंबित'], confirmed: ['Confirmed', 'पुष्टि हुई'], processing: ['Processing', 'तैयार हो रहा है'], fulfilled: ['Fulfilled', 'पूरा हुआ'], cancelled: ['Cancelled', 'रद्द'], refunded: ['Refunded', 'रिफंड हुआ'], packed: ['Packed', 'पैक हुआ'], shipped: ['Shipped', 'भेजा गया'], delivered: ['Delivered', 'पहुँच गया'],
};
export function orderStatusLabel(status, language = 'en') { const hindi=resolveIndianLocale(language).language==='hi';return statuses[status]?.[hindi ? 1 : 0] ?? (hindi ? 'स्थिति उपलब्ध नहीं है' : 'Status unavailable'); }
export function formatWorkspaceMoney(minor, currency = 'INR', language = 'en') {
  if (!Number.isSafeInteger(minor) || minor < 0 || !/^[A-Z]{3}$/.test(currency)) return '—';
  return new Intl.NumberFormat(resolveIndianLocale(language).locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100);
}
