(() => {
  const defaults = Object.freeze({
    price_intelligence_enabled: false,
    receipt_market_opt_in_enabled: false,
    store_flyer_import_enabled: false,
    store_social_import_enabled: false
  });

  window.KaimonoFeatureFlags = Object.freeze({
    defaults,
    isEnabled(name, serverFlags = {}, environment = "production") {
      if (!(name in defaults)) return false;
      if (environment === "production") return false;
      return serverFlags[name] === true;
    }
  });
})();
