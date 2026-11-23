(() => {
  function openLinkedRoute() {
    const route = document.getElementById(location.hash.slice(1));
    if (!route?.matches('details.training-section')) return;
    route.open = true;
    route.scrollIntoView();
  }

  window.addEventListener('hashchange', openLinkedRoute);
  openLinkedRoute();
})();
