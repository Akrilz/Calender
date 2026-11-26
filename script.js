// JavaScript: tự động đánh dấu thứ hiện tại.
// getDay(): Chủ nhật = 0, Thứ 2 = 1, ..., Thứ 7 = 6.
(function highlightToday() {
  const today = new Date().getDay();
  const cellsForToday = document.querySelectorAll(`[data-day="${today}"]`);

  cellsForToday.forEach((cell) => {
    cell.classList.add("today");
  });

  const todayHeader = document.querySelector(`thead [data-day="${today}"] .today-label`);
  if (todayHeader) {
    todayHeader.textContent = "Hôm nay";
  }
})();
