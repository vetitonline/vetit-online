document.addEventListener("DOMContentLoaded", function () {
  const cartStorageKey = "vetit-cart-v1";
  const defaultImage =
    "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?auto=format&fit=crop&w=800&q=80";
  const status = document.querySelector("[data-cart-status]");

  function readCart() {
    try {
      const stored = JSON.parse(window.localStorage.getItem(cartStorageKey) || "[]");
      if (!Array.isArray(stored)) return [];

      return stored.filter((item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0
      ).map((item) => ({
        id: item.id,
        title: item.title,
        category: typeof item.category === "string" ? item.category : "Product",
        seller: typeof item.seller === "string" ? item.seller : "Vetit seller",
        image: safeImage(item.image),
        pricePaise: Number.isSafeInteger(item.pricePaise) && item.pricePaise >= 0
          ? item.pricePaise
          : null,
        quantity: Math.min(item.quantity, 99),
      }));
    } catch {
      return [];
    }
  }

  function safeImage(value) {
    try {
      const url = new URL(value || defaultImage, window.location.href);
      return url.protocol === "https:" ? url.href : defaultImage;
    } catch {
      return defaultImage;
    }
  }

  let cart = readCart();

  function writeCart() {
    try {
      window.localStorage.setItem(cartStorageKey, JSON.stringify(cart));
      return true;
    } catch {
      return false;
    }
  }

  function say(message) {
    if (status) status.textContent = message;
  }

  function updateCartBadges() {
    const count = cart.reduce((total, item) => total + item.quantity, 0);
    document.querySelectorAll(".cart-link").forEach((link) => {
      const badge = link.querySelector(".cart-count");
      if (badge) badge.textContent = String(count);
      link.setAttribute(
        "aria-label",
        `Shopping cart, ${count} ${count === 1 ? "item" : "items"}`,
      );
    });
  }

  function formatPrice(pricePaise) {
    if (pricePaise === null) return "Price on request";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(pricePaise / 100);
  }

  function makeButton(label, action, className = "button button-secondary small-button") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.cartAction = action;
    button.setAttribute("aria-label", label);
    button.textContent = label;
    return button;
  }

  function renderCartPage() {
    const list = document.querySelector("[data-cart-items]");
    if (!list) return;

    const empty = document.querySelector("[data-cart-empty]");
    const summary = document.querySelector("[data-cart-summary]");
    const subtotal = document.querySelector("[data-cart-subtotal]");
    list.replaceChildren();
    empty.hidden = cart.length > 0;
    summary.hidden = cart.length === 0;

    let pricedSubtotal = 0;
    let itemsWithoutPrice = 0;

    cart.forEach((item) => {
      const row = document.createElement("article");
      row.className = "cart-line";
      row.dataset.productId = item.id;

      const imageWrap = document.createElement("div");
      imageWrap.className = "product-image-wrap";
      const image = document.createElement("img");
      image.src = item.image;
      image.alt = item.title;
      image.loading = "lazy";
      imageWrap.append(image);
      const tag = document.createElement("span");
      tag.className = "product-tag";
      tag.textContent = item.category;
      imageWrap.append(tag);

      const content = document.createElement("div");
      content.className = "cart-line-content";
      const seller = document.createElement("span");
      seller.className = "product-seller";
      seller.textContent = item.seller;
      const title = document.createElement("h2");
      title.textContent = item.title;
      const price = document.createElement("p");
      price.textContent = `${formatPrice(item.pricePaise)} · Quantity ${item.quantity}`;

      const actions = document.createElement("div");
      actions.className = "cart-actions";
      actions.append(
        makeButton("−", "decrease", "button button-secondary small-button"),
      );
      const quantity = document.createElement("span");
      quantity.textContent = String(item.quantity);
      quantity.setAttribute("aria-label", `Quantity ${item.quantity}`);
      actions.append(quantity);
      actions.append(makeButton("+", "increase", "button button-secondary small-button"));
      actions.append(makeButton("Remove", "remove", "button button-ghost small-button"));
      content.append(seller, title, price, actions);
      row.append(imageWrap, content);
      list.append(row);

      if (item.pricePaise === null) itemsWithoutPrice += item.quantity;
      else pricedSubtotal += item.pricePaise * item.quantity;
    });

    if (subtotal) {
      subtotal.textContent = itemsWithoutPrice > 0
        ? `Subtotal for priced items: ${formatPrice(pricedSubtotal)}. ${itemsWithoutPrice} item(s) have a price on request.`
        : `Subtotal: ${formatPrice(pricedSubtotal)}`;
    }
  }

  updateCartBadges();
  renderCartPage();

  document.querySelectorAll("[data-add-to-cart]").forEach((button) => {
    button.addEventListener("click", function () {
      const card = button.closest("[data-cart-product]");
      if (!card) return;

      const id = card.dataset.productId;
      const title = card.dataset.productTitle;
      if (!id || !title) return;

      const rawPrice = card.dataset.productPricePaise;
      const price = rawPrice === "" || rawPrice === undefined ? null : Number(rawPrice);
      const existing = cart.find((item) => item.id === id);
      if (existing) existing.quantity = Math.min(existing.quantity + 1, 99);
      else {
        cart.push({
          id,
          title,
          category: card.dataset.productCategory || "Product",
          seller: card.dataset.productSeller || "Vetit seller",
          image: safeImage(card.dataset.productImage),
          pricePaise: Number.isSafeInteger(price) && price >= 0 ? price : null,
          quantity: 1,
        });
      }

      const persisted = writeCart();
      updateCartBadges();
      renderCartPage();
      say(persisted ? `${title} added to your cart.` : `${title} added for this page, but browser storage is unavailable.`);
    });
  });

  const cartList = document.querySelector("[data-cart-items]");
  cartList?.addEventListener("click", function (event) {
    const button = event.target.closest("[data-cart-action]");
    const row = button?.closest("[data-product-id]");
    if (!button || !row) return;

    const item = cart.find((entry) => entry.id === row.dataset.productId);
    if (!item) return;
    const action = button.dataset.cartAction;
    if (action === "remove" || (action === "decrease" && item.quantity === 1)) {
      cart = cart.filter((entry) => entry.id !== item.id);
    } else if (action === "decrease") {
      item.quantity -= 1;
    } else if (action === "increase") {
      item.quantity = Math.min(item.quantity + 1, 99);
    }

    writeCart();
    updateCartBadges();
    renderCartPage();
    say(action === "remove" ? `${item.title} removed from your cart.` : "Cart quantity updated.");
  });

  document.querySelector("[data-cart-clear]")?.addEventListener("click", function () {
    cart = [];
    writeCart();
    updateCartBadges();
    renderCartPage();
    say("Your cart has been cleared.");
  });

  const searchForm = document.querySelector(".marketplace-search");
  const searchInput = searchForm?.querySelector("#marketplace-search");
  const searchStatus = searchForm?.querySelector("[data-search-status]");
  const searchableItems = Array.from(
    document.querySelectorAll(".product-card, .category-card, .feature-card"),
  );

  if (!searchForm || !searchInput || !searchStatus || searchableItems.length === 0) {
    return;
  }

  function clearSearch() {
    searchableItems.forEach((item) => {
      item.hidden = false;
    });
    searchStatus.hidden = true;
    searchStatus.textContent = "";
  }

  searchForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const query = searchInput.value.trim().toLocaleLowerCase();

    if (!query) {
      clearSearch();
      searchStatus.hidden = false;
      searchStatus.textContent = "Enter a search term to find items on this page.";
      return;
    }

    const matches = searchableItems.filter((item) => {
      const text = item.textContent.toLocaleLowerCase();
      const imageAlt = Array.from(item.querySelectorAll("img[alt]"))
        .map((image) => image.alt.toLocaleLowerCase())
        .join(" ");
      return text.includes(query) || imageAlt.includes(query);
    });

    searchableItems.forEach((item) => {
      item.hidden = !matches.includes(item);
    });

    searchStatus.hidden = false;
    searchStatus.textContent = matches.length
      ? `${matches.length} matching items found on this page.`
      : "No matching items found on this page. Clear the search to show all items.";

    if (matches.length > 0) {
      matches[0].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  searchInput.addEventListener("input", function () {
    if (!searchInput.value.trim()) clearSearch();
  });

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", clearSearch);
  });
});
