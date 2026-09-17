document.addEventListener("DOMContentLoaded", function () {

    const marketplaceButton = document.querySelector("button:nth-of-type(2)");

    const servicesButton = document.querySelector("button:nth-of-type(1)");

    if (marketplaceButton) {

        marketplaceButton.addEventListener("click", function () {

            alert("Marketplace is working!");

        });

    }

    if (servicesButton) {

        servicesButton.addEventListener("click", function () {

            alert("Trusted Services is working!");

        });

    }

});
