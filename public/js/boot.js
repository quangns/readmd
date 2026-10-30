// Chạy đồng bộ trong <head> trước khi vẽ trang: đặt theme và ứng dụng (#json / #crypto)
// để không nháy giao diện. Tách khỏi HTML để Content-Security-Policy không cần 'unsafe-inline' cho script.
// Đặt theme trước khi trang hiển thị để không bị nháy nền sáng
(function () {
  var m = localStorage.getItem('convertsrs-theme');
  var dark = m === 'dark' || (m !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  // Ứng dụng mở theo đường dẫn (#json, #crypto), mặc định convertSRS — gán trước khi vẽ để không nháy
  var app = location.hash.slice(1);
  document.documentElement.dataset.app = app === 'json' || app === 'crypto' ? app : 'srs';
})();
