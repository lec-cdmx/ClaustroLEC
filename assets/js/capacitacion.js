(() => {
  const links = document.querySelectorAll(".training-route");

  function updateExpandedState() {
    for (const link of links) {
      link.setAttribute("aria-expanded", String(link.hash === location.hash));
    }
  }

  for (const link of links) {
    link.addEventListener("click", event => {
      if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (link.hash !== location.hash) return;

      event.preventDefault();
      location.hash = "rutas-capacitacion";
    });
  }

  window.addEventListener("hashchange", updateExpandedState);
  updateExpandedState();
})();
