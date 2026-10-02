document.addEventListener("DOMContentLoaded", function () {
  const searchForm = document.querySelector(".marketplace-search");
  const searchInput = searchForm?.querySelector("#marketplace-search");
  const searchStatus = searchForm?.querySelector("[data-search-status]");
  const searchableItems = Array.from(
    document.querySelectorAll(".product-card, .category-card, .feature-card")
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
    if (!searchInput.value.trim()) {
      clearSearch();
    }
  });

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", clearSearch);
  });
});
