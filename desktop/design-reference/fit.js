/* fit-to-pane zoom for direct preview; the Design System tab frames boards at their declared viewport */
(function () {
  function fit() {
    var w = 0, kids = document.body.children;
    for (var i = 0; i < kids.length; i++) w = Math.max(w, kids[i].offsetWidth || 0);
    if (!w) w = document.body.scrollWidth;
    document.body.style.zoom = Math.min(1, (window.innerWidth - 8) / w);
  }
  addEventListener('resize', fit); addEventListener('load', fit);
  if (document.readyState !== 'loading') fit(); else document.addEventListener('DOMContentLoaded', fit);
})();
