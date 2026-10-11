import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Image, Linking, Pressable, ScrollView, StatusBar, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import type { CatalogApiResponse, CatalogRequestFilters } from '../src/lib/marketplace/catalog-client';
import { CatalogClientError, fetchCatalog } from '../src/lib/marketplace/catalog-client';
import type { FeaturedProduct, ProductAnimal, ProductCategory } from '../src/lib/marketplace/featured-products';

type Tab = 'home' | 'shop' | 'services' | 'cart' | 'account';
type CartLine = { product: FeaturedProduct; quantity: number };
type LoadState = { loading: boolean; data: CatalogApiResponse | null; error: string | null };

const API_BASE_URL = process.env.EXPO_PUBLIC_VETIT_API_BASE_URL?.trim() || 'https://vetit.online';
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const tabs: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' }, { id: 'shop', label: 'Shop' }, { id: 'services', label: 'Services' },
  { id: 'cart', label: 'Cart' }, { id: 'account', label: 'Account' },
];

function money(product: FeaturedProduct) {
  return product.priceMinor === null ? 'Price on request' : currency.format(product.priceMinor / 100);
}

function openWeb(path: string) {
  void Linking.openURL(`${API_BASE_URL.replace(/\/$/, '')}${path}`).catch(() => undefined);
}

function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]} accessibilityRole="button">
    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
  </Pressable>;
}

function ProductTile({ product, onPress, onAdd }: { product: FeaturedProduct; onPress: () => void; onAdd: () => void }) {
  return <View style={styles.productCard}>
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`View ${product.title}`}>
      {product.imageUrl
        ? <Image source={{ uri: product.imageUrl }} style={styles.productImage} resizeMode="cover" accessibilityLabel={product.imageAlt || product.title} />
        : <View style={styles.imageFallback}><Text style={styles.fallbackCategory}>{product.category}</Text><Text style={styles.fallbackCaption}>Vetit category artwork</Text></View>}
      <View style={styles.productInfo}>
        <Text style={styles.sellerName} numberOfLines={1}>{product.sellerName}</Text>
        <Text style={styles.productTitle} numberOfLines={2}>{product.title}</Text>
        <Text style={styles.productPrice}>{money(product)}</Text>
      </View>
    </Pressable>
    <Pressable disabled={product.priceIsFrom} onPress={onAdd} style={[styles.addButton, product.priceIsFrom && styles.buttonDisabled]} accessibilityRole="button" accessibilityLabel={`Add ${product.title} to preview cart`}>
      <Text style={styles.addButtonText}>{product.priceIsFrom ? 'Choose option online' : 'Add to cart'}</Text>
    </Pressable>
  </View>;
}

function ProductDetail({ product, onBack, onAdd }: { product: FeaturedProduct; onBack: () => void; onAdd: () => void }) {
  return <View>
    <Pressable onPress={onBack}><Text style={styles.backLink}>‹ Back to browsing</Text></Pressable>
    {product.imageUrl
      ? <Image source={{ uri: product.imageUrl }} style={styles.detailImage} resizeMode="cover" accessibilityLabel={product.imageAlt || product.title} />
      : <View style={[styles.imageFallback, styles.detailFallback]}><Text style={styles.fallbackCategory}>{product.category}</Text><Text style={styles.fallbackCaption}>Category artwork · seller photo not supplied</Text></View>}
    <Text style={styles.eyebrow}>{product.category}</Text>
    <Text style={styles.detailTitle}>{product.title}</Text>
    <Text style={styles.sellerName}>{product.sellerName}</Text>
    <Text style={styles.productPrice}>{money(product)}</Text>
    <Text style={styles.description}>{product.description || 'Product details have not been provided.'}</Text>
    <Pressable onPress={product.priceIsFrom ? () => openWeb(`/products/${encodeURIComponent(product.slug || product.id)}`) : onAdd} style={styles.primaryButton}>
      <Text style={styles.primaryButtonText}>{product.priceIsFrom ? 'View options on Vetit Online' : 'Add to cart'}</Text>
    </Pressable>
    {product.priceIsFrom && <Text style={styles.note}>Variant selection is not available in the mobile preview yet.</Text>}
  </View>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [animalSlug, setAnimalSlug] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState<CatalogRequestFilters['sort']>('newest');
  const [page, setPage] = useState(1);
  const [browseReload, setBrowseReload] = useState(0);
  const [detailReload, setDetailReload] = useState(0);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [catalog, setCatalog] = useState<LoadState>({ loading: true, data: null, error: null });
  const [detail, setDetail] = useState<LoadState>({ loading: false, data: null, error: null });

  const filters = useMemo<CatalogRequestFilters>(() => ({
    query: query.trim() || undefined,
    animal: animalSlug || undefined,
    category: categorySlug || undefined,
    minPriceRupees: minPrice || undefined,
    maxPriceRupees: maxPrice || undefined,
    sort,
    page,
    pageSize: 24,
  }), [query, animalSlug, categorySlug, minPrice, maxPrice, sort, page]);

  const loadBrowse = useCallback(async (signal?: AbortSignal) => {
    const data = await fetchCatalog(filters, { baseUrl: API_BASE_URL, signal });
    return data;
  }, [filters]);

  useEffect(() => {
    if (tab !== 'home' && tab !== 'shop') return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setCatalog((current) => ({ ...current, loading: true, error: null }));
      void loadBrowse(controller.signal).then((data) => {
        setCatalog({ loading: false, data, error: null });
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof CatalogClientError ? error.message : 'The catalogue is unavailable right now.';
        setCatalog((current) => ({ ...current, loading: false, error: message }));
      });
    }, query ? 300 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [tab, loadBrowse, query, browseReload]);

  useEffect(() => {
    if (!detailKey) return;
    const controller = new AbortController();
    setDetail({ loading: true, data: null, error: null });
    void fetchCatalog({ product: detailKey, pageSize: 1 }, { baseUrl: API_BASE_URL, signal: controller.signal })
      .then((data) => setDetail({ loading: false, data, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDetail({ loading: false, data: null, error: error instanceof Error ? error.message : 'Product details are unavailable.' });
      });
    return () => controller.abort();
  }, [detailKey, detailReload]);

  const products = catalog.data?.products ?? [];
  const selectedProduct = detail.data?.products[0] ?? null;
  const taxonomy = catalog.data?.taxonomy;
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cart.reduce((sum, line) => sum + (line.product.priceMinor ?? 0) * line.quantity, 0);

  const browseCategory = (category: ProductCategory) => {
    setCategorySlug(category.slug); setAnimalSlug(''); setPage(1); setTab('shop'); setDetailKey(null);
  };
  const browseAnimal = (animal: ProductAnimal | null) => {
    setAnimalSlug(animal?.slug ?? ''); setCategorySlug(''); setPage(1); setTab('shop'); setDetailKey(null);
  };
  const addToCart = (product: FeaturedProduct) => {
    if (product.priceIsFrom) return;
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) return current.map((line) => line.product.id === product.id ? { ...line, quantity: Math.min(99, line.quantity + 1) } : line);
      return [...current, { product, quantity: 1 }];
    });
  };

  const resetFilters = () => {
    setQuery(''); setAnimalSlug(''); setCategorySlug(''); setMinPrice(''); setMaxPrice(''); setSort('newest'); setPage(1);
  };

  const productList = (list: FeaturedProduct[]) => list.length === 0
    ? <View style={styles.emptyBox}><Text style={styles.emptyTitle}>No products found</Text><Text style={styles.muted}>Try another category or clear your filters.</Text><Pressable onPress={resetFilters}><Text style={styles.inlineLink}>Clear filters</Text></Pressable></View>
    : <View style={styles.productList}>{list.map((product) => <ProductTile key={product.id} product={product} onPress={() => setDetailKey(product.slug || product.id)} onAdd={() => addToCart(product)} />)}</View>;

  const renderHome = () => <>
    <View style={styles.hero}>
      <Image source={require('../Vetit-online-transparent.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="Vetit Online" />
      <Text style={styles.heroTitle}>Everything your pets & livestock need.</Text>
      <Text style={styles.heroBody}>Browse real products from Vetit’s marketplace.</Text>
      <Pressable onPress={() => setTab('shop')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Explore marketplace</Text></Pressable>
    </View>
    <Text style={styles.sectionTitle}>Shop by pets & livestock</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>
      <Chip label="All" selected={!animalSlug} onPress={() => browseAnimal(null)} />
      {(taxonomy?.animals ?? []).map((animal) => <Chip key={animal.id} label={animal.label} selected={animalSlug === animal.slug} onPress={() => browseAnimal(animal)} />)}
    </ScrollView>
    <Text style={styles.sectionTitle}>Browse categories</Text>
    <View style={styles.categoryGrid}>
      {(taxonomy?.categories ?? []).filter((category) => !category.parentId).map((category, index) => (
        <Pressable key={category.id} onPress={() => browseCategory(category)} style={[styles.categoryCard, index % 2 === 0 ? styles.categoryViolet : styles.categoryOrange]}>
          <Text style={styles.categoryMark}>{category.label.slice(0, 1)}</Text><Text style={styles.categoryTitle}>{category.label}</Text><Text style={styles.categoryLink}>Explore ›</Text>
        </Pressable>
      ))}
    </View>
    <Text style={styles.sectionTitle}>Published products</Text>
    {catalog.loading && !catalog.data ? <LoadingState /> : catalog.error ? <ErrorState message={catalog.error} onRetry={() => setBrowseReload((current) => current + 1)} /> : productList(products.slice(0, 6))}
    <Pressable onPress={() => setTab('shop')} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Browse all products</Text></Pressable>
  </>;

  const renderShop = () => <>
    <Text style={styles.pageTitle}>Marketplace</Text>
    <Text style={styles.muted}>Find products for pets, livestock and the farm.</Text>
    <TextInput value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Search products" placeholderTextColor={colors.muted} style={styles.input} returnKeyType="search" accessibilityLabel="Search products" />
    <Text style={styles.filterLabel}>Pets & livestock</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>
      <Chip label="All" selected={!animalSlug} onPress={() => { setAnimalSlug(''); setCategorySlug(''); setPage(1); }} />
      {(taxonomy?.animals ?? []).map((animal) => <Chip key={animal.id} label={animal.label} selected={animalSlug === animal.slug} onPress={() => { setAnimalSlug(animal.slug); setCategorySlug(''); setPage(1); }} />)}
    </ScrollView>
    <Text style={styles.filterLabel}>Categories</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>
      <Chip label="All categories" selected={!categorySlug} onPress={() => { setCategorySlug(''); setPage(1); }} />
      {(taxonomy?.categories ?? []).filter((category) => !animalSlug || category.species.includes(taxonomy?.animals.find((item) => item.slug === animalSlug)?.id ?? '')).map((category) => <Chip key={category.id} label={category.label} selected={categorySlug === category.slug} onPress={() => { setCategorySlug(category.slug); setPage(1); }} />)}
    </ScrollView>
    <View style={styles.filterRow}>
      <TextInput value={minPrice} onChangeText={(value) => { setMinPrice(value); setPage(1); }} placeholder="Min ₹" keyboardType="numeric" style={[styles.input, styles.priceInput]} accessibilityLabel="Minimum price in rupees" />
      <TextInput value={maxPrice} onChangeText={(value) => { setMaxPrice(value); setPage(1); }} placeholder="Max ₹" keyboardType="numeric" style={[styles.input, styles.priceInput]} accessibilityLabel="Maximum price in rupees" />
      <View style={styles.sortGroup}>
        {(['newest', 'price-asc', 'price-desc'] as const).map((option) => <Chip key={option} label={option === 'newest' ? 'Recent' : option === 'price-asc' ? '₹ Low' : '₹ High'} selected={sort === option} onPress={() => { setSort(option); setPage(1); }} />)}
      </View>
    </View>
    {catalog.loading && !catalog.data ? <LoadingState /> : catalog.error ? <ErrorState message={catalog.error} onRetry={() => setBrowseReload((current) => current + 1)} /> : productList(products)}
    {catalog.data && <View style={styles.pagination}>
      <Pressable disabled={!catalog.data.pagination.hasPrevious} onPress={() => setPage((current) => Math.max(1, current - 1))}><Text style={catalog.data.pagination.hasPrevious ? styles.inlineLink : styles.disabledLink}>‹ Previous</Text></Pressable>
      <Text style={styles.muted}>Page {catalog.data.pagination.page} of {catalog.data.pagination.pageCount}</Text>
      <Pressable disabled={!catalog.data.pagination.hasNext} onPress={() => setPage((current) => current + 1)}><Text style={catalog.data.pagination.hasNext ? styles.inlineLink : styles.disabledLink}>Next ›</Text></Pressable>
    </View>}
  </>;

  const renderCart = () => <>
    <Text style={styles.pageTitle}>Your cart</Text>
    <Text style={styles.muted}>This preview stays in memory on this device.</Text>
    {cart.length === 0 ? <View style={styles.emptyBox}><Text style={styles.emptyTitle}>Your cart is empty</Text><Pressable onPress={() => setTab('shop')}><Text style={styles.inlineLink}>Browse products</Text></Pressable></View> : <>
      {cart.map((line) => <View key={line.product.id} style={styles.cartLine}>
        <View style={styles.cartLineText}><Text style={styles.productTitle}>{line.product.title}</Text><Text style={styles.muted}>{money(line.product)} · Qty {line.quantity}</Text></View>
        <Pressable onPress={() => setCart((items) => items.filter((item) => item.product.id !== line.product.id))}><Text style={styles.inlineLink}>Remove</Text></Pressable>
      </View>)}
      <Text style={styles.productPrice}>Priced items: {currency.format(cartTotal / 100)}</Text>
      <Text style={styles.note}>Checkout, order submission and payment are not enabled.</Text>
      <Pressable onPress={() => setCart([])} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Clear preview cart</Text></Pressable>
    </>}
  </>;

  const renderOther = () => tab === 'services' ? <View style={styles.infoCard}>
    <Text style={styles.pageTitle}>Pet & vet services</Text><Text style={styles.description}>Service discovery is available on Vetit Online. Mobile service booking is not enabled.</Text>
    <Pressable onPress={() => openWeb('/services')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Explore services online</Text></Pressable>
  </View> : <View style={styles.infoCard}>
    <Text style={styles.pageTitle}>Your Vetit account</Text><Text style={styles.description}>Sign-in uses Vetit’s existing secure OTP flow on the website. Seller and admin tools are not enabled in this mobile preview.</Text>
    <Pressable onPress={() => openWeb('/login')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Continue to sign in online</Text></Pressable>
  </View>;

  return <View style={styles.app}>
    <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
    <View style={styles.topBar}><Image source={require('../Vetit-online-transparent.png')} style={styles.topLogo} resizeMode="contain" /><Pressable onPress={() => setTab('cart')}><Text style={styles.cartBadge}>Cart · {cartCount}</Text></Pressable></View>
    <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
      {detailKey ? detail.loading ? <LoadingState /> : detail.error ? <ErrorState message={detail.error} onRetry={() => setDetailReload((current) => current + 1)} /> : selectedProduct ? <ProductDetail product={selectedProduct} onBack={() => setDetailKey(null)} onAdd={() => addToCart(selectedProduct)} /> : <View style={styles.emptyBox}><Text style={styles.emptyTitle}>Product is no longer available</Text><Pressable onPress={() => setDetailKey(null)}><Text style={styles.inlineLink}>Back to browsing</Text></Pressable></View>
        : tab === 'home' ? renderHome() : tab === 'shop' ? renderShop() : tab === 'cart' ? renderCart() : renderOther()}
    </ScrollView>
    <View style={styles.tabBar}>{tabs.map((item) => <Pressable key={item.id} onPress={() => { setDetailKey(null); setTab(item.id); }} style={styles.tabItem} accessibilityRole="button" accessibilityState={{ selected: tab === item.id }}>
      <Text style={[styles.tabLabel, tab === item.id && styles.tabLabelActive]}>{item.label}{item.id === 'cart' && cartCount > 0 ? ` (${cartCount})` : ''}</Text>
    </Pressable>)}</View>
  </View>;
}

function LoadingState() {
  return <View style={styles.stateBox}><ActivityIndicator color={colors.violet} /><Text style={styles.muted}>Loading the Vetit marketplace…</Text></View>;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <View style={styles.stateBox}><Text style={styles.emptyTitle}>Catalogue unavailable</Text><Text style={styles.muted}>{message} Check your connection and try again.</Text><Pressable onPress={onRetry} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Retry</Text></Pressable></View>;
}

const colors = { violet: '#6339a8', violetDark: '#452779', violetPale: '#f2ecfa', orange: '#f27d32', orangePale: '#fff1e7', background: '#fffdfb', ink: '#292431', muted: '#716b78', border: '#e8e1ed', white: '#ffffff' };
const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.background, paddingTop: 40 },
  topBar: { height: 54, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  topLogo: { width: 138, height: 40 }, cartBadge: { color: colors.violet, fontWeight: '700' },
  screenContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30 },
  hero: { backgroundColor: colors.violetPale, borderRadius: 22, padding: 20, marginBottom: 22, borderBottomWidth: 4, borderBottomColor: colors.orange },
  logo: { width: 190, height: 58, alignSelf: 'flex-start', marginBottom: 10 }, heroTitle: { fontSize: 27, lineHeight: 33, fontWeight: '800', color: colors.violetDark },
  heroBody: { fontSize: 15, color: colors.muted, marginTop: 8, marginBottom: 16 },
  pageTitle: { fontSize: 27, fontWeight: '800', color: colors.ink, marginBottom: 6 }, sectionTitle: { fontSize: 19, fontWeight: '800', color: colors.ink, marginTop: 16, marginBottom: 11 },
  eyebrow: { color: colors.orange, fontWeight: '800', textTransform: 'uppercase', marginTop: 18 },
  horizontalChips: { gap: 8, paddingBottom: 7 }, chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.white }, chipSelected: { backgroundColor: colors.violet, borderColor: colors.violet }, chipText: { color: colors.ink, fontSize: 13, fontWeight: '600' }, chipTextSelected: { color: colors.white },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, categoryCard: { width: '47%', minHeight: 118, padding: 13, borderRadius: 16, justifyContent: 'space-between' }, categoryViolet: { backgroundColor: colors.violetPale }, categoryOrange: { backgroundColor: colors.orangePale }, categoryMark: { color: colors.violet, fontSize: 21, fontWeight: '900' }, categoryTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' }, categoryLink: { color: colors.violet, fontSize: 12, fontWeight: '700' },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 12, minHeight: 46, paddingHorizontal: 13, color: colors.ink, marginTop: 12 }, filterLabel: { color: colors.ink, fontWeight: '700', marginTop: 13, marginBottom: 8 }, filterRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }, priceInput: { flex: 1, minWidth: 90 }, sortGroup: { flexDirection: 'row', gap: 5 },
  productList: { gap: 13, marginTop: 12 }, productCard: { backgroundColor: colors.white, borderRadius: 17, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, paddingBottom: 12 }, productImage: { width: '100%', height: 190, backgroundColor: colors.violetPale }, imageFallback: { width: '100%', height: 150, backgroundColor: colors.violetPale, alignItems: 'center', justifyContent: 'center', padding: 16 }, detailImage: { width: '100%', height: 270, borderRadius: 18, backgroundColor: colors.violetPale, marginTop: 14 }, detailFallback: { height: 240, borderRadius: 18, marginTop: 14 }, fallbackCategory: { color: colors.violet, fontSize: 20, fontWeight: '800' }, fallbackCaption: { color: colors.muted, fontSize: 12, marginTop: 5 }, productInfo: { paddingHorizontal: 14, paddingTop: 12 }, sellerName: { color: colors.muted, fontSize: 12 }, productTitle: { color: colors.ink, fontSize: 16, fontWeight: '700', marginTop: 5 }, productPrice: { color: colors.violetDark, fontWeight: '800', fontSize: 17, marginTop: 7 }, addButton: { alignSelf: 'flex-start', marginHorizontal: 14, marginTop: 12, backgroundColor: colors.orange, paddingHorizontal: 15, paddingVertical: 10, borderRadius: 10 }, addButtonText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  primaryButton: { backgroundColor: colors.violet, paddingHorizontal: 18, paddingVertical: 13, borderRadius: 12, alignSelf: 'flex-start', marginTop: 10 }, primaryButtonText: { color: colors.white, fontWeight: '800' }, secondaryButton: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: colors.violet, borderRadius: 11, marginTop: 13 }, secondaryButtonText: { color: colors.violet, fontWeight: '800' }, buttonDisabled: { opacity: 0.45 },
  stateBox: { alignItems: 'center', padding: 28, gap: 10, backgroundColor: colors.violetPale, borderRadius: 16, marginTop: 16 }, emptyBox: { alignItems: 'flex-start', padding: 20, gap: 8, backgroundColor: colors.violetPale, borderRadius: 16, marginTop: 16 }, emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' }, muted: { color: colors.muted, fontSize: 13, lineHeight: 19 }, inlineLink: { color: colors.violet, fontWeight: '800', paddingVertical: 5 }, disabledLink: { color: '#aaa4af', fontWeight: '700' },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, paddingVertical: 8 }, detailTitle: { color: colors.ink, fontSize: 27, fontWeight: '800', marginTop: 7 }, description: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 12 }, backLink: { color: colors.violet, fontWeight: '800', paddingVertical: 8 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 10 },
  cartLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 14, gap: 10 }, cartLineText: { flex: 1 }, infoCard: { backgroundColor: colors.violetPale, borderRadius: 18, padding: 18, marginTop: 25 }, tabBar: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.white, borderTopWidth: 1, borderColor: colors.border, paddingTop: 9, paddingBottom: 17 }, tabItem: { paddingHorizontal: 4, paddingVertical: 6 }, tabLabel: { color: colors.muted, fontWeight: '600', fontSize: 11 }, tabLabelActive: { color: colors.violet, fontWeight: '900' },
});
