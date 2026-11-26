/*
 * KẾT NỐI GOOGLE SHEETS
 * 1. Tạo Apps Script từ Google Sheets và triển khai dưới dạng Web app.
 * 2. Dán URL kết thúc bằng /exec vào APPS_SCRIPT_URL bên dưới.
 */
const APPS_SCRIPT_URL = "DAN_URL_WEB_APP_CUA_BAN_VAO_DAY";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // Tự đồng bộ lại sau mỗi 5 phút.
const STORAGE_KEY = "selectedScheduleClass";

const DAY_COLUMNS = [
  { day: 1, label: "Thứ 2" },
  { day: 2, label: "Thứ 3" },
  { day: 3, label: "Thứ 4" },
  { day: 4, label: "Thứ 5" },
  { day: 5, label: "Thứ 6" },
  { day: 6, label: "Thứ 7" },
  { day: 0, label: "Chủ nhật" }
];

const titleElement = document.getElementById("schedule-title");
const classSelect = document.getElementById("class-select");
const scheduleBody = document.getElementById("schedule-body");
const syncStatus = document.getElementById("sync-status");
const syncMessage = document.getElementById("sync-message");
const dataNote = document.getElementById("data-note");
const refreshButton = document.getElementById("refresh-button");

let scheduleClasses = [];
let isLoading = false;

function setStatus(message, state = "normal") {
  syncMessage.textContent = message;
  syncStatus.classList.remove("is-loading", "is-error");
  if (state === "loading") syncStatus.classList.add("is-loading");
  if (state === "error") syncStatus.classList.add("is-error");
}

function showTableMessage(message) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.className = "table-message";
  cell.colSpan = 8;
  cell.textContent = message;
  row.appendChild(cell);
  scheduleBody.replaceChildren(row);
}

function markToday() {
  document.querySelectorAll(".schedule-table [data-day]").forEach((cell) => {
    cell.classList.remove("today");
  });

  const today = new Date().getDay();
  document.querySelectorAll(`.schedule-table [data-day="${today}"]`).forEach((cell) => {
    cell.classList.add("today");
  });

  document.querySelectorAll(".today-label").forEach((label) => {
    label.textContent = "";
  });

  const todayLabel = document.querySelector(`thead [data-day="${today}"] .today-label`);
  if (todayLabel) todayLabel.textContent = "Hôm nay";
}

function createLessonCard(lesson) {
  const card = document.createElement("div");
  card.className = "lesson";

  const subject = document.createElement("strong");
  subject.textContent = lesson.subject || "Chưa có tên môn";
  card.appendChild(subject);

  if (lesson.linkText) {
    const linkUrl = String(lesson.linkUrl || "").trim();
    let safeUrl = false;

    // Chỉ cho phép liên kết HTTP/HTTPS; không cho phép javascript: hoặc data:.
    try {
      const parsedUrl = new URL(linkUrl);
      safeUrl = parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:";
    } catch (_error) {
      safeUrl = false;
    }

    if (safeUrl) {
      const link = document.createElement("a");
      link.className = "lesson-link";
      link.textContent = lesson.linkText;
      link.href = linkUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", `${lesson.linkText} – mở liên kết trong tab mới`);
      card.appendChild(link);
    } else {
      // Vẫn hiển thị nội dung nếu chưa nhập URL, nhưng không biến nó thành liên kết.
      const label = document.createElement("span");
      label.className = "lesson-link is-disabled";
      label.textContent = lesson.linkText;
      card.appendChild(label);
    }
  }

  return card;
}

function renderSelectedClass(classCode) {
  const selectedClass = scheduleClasses.find((item) => item.code === classCode);
  if (!selectedClass) {
    showTableMessage("Không tìm thấy dữ liệu của lớp này trong Google Sheets.");
    return;
  }

  titleElement.textContent = `Thông tin ${selectedClass.title || selectedClass.code}`;
  document.title = `Thời khóa biểu - ${selectedClass.code}`;

  const periods = [...new Set(selectedClass.lessons.map((lesson) => lesson.period).filter(Boolean))];
  if (periods.length === 0) {
    showTableMessage("Lớp này hiện chưa có lịch học.");
    return;
  }

  const fragment = document.createDocumentFragment();

  periods.forEach((period) => {
    const row = document.createElement("tr");
    const periodCell = document.createElement("th");
    periodCell.className = "period-cell";
    periodCell.scope = "row";
    periodCell.textContent = period;
    row.appendChild(periodCell);

    DAY_COLUMNS.forEach(({ day }) => {
      const cell = document.createElement("td");
      cell.dataset.day = String(day);

      const lessonsInCell = selectedClass.lessons.filter(
        (lesson) => lesson.period === period && Number(lesson.day) === day
      );

      if (lessonsInCell.length === 0) {
        const empty = document.createElement("span");
        empty.className = "empty";
        empty.textContent = "—";
        cell.appendChild(empty);
      } else {
        lessonsInCell.forEach((lesson) => cell.appendChild(createLessonCard(lesson)));
      }

      row.appendChild(cell);
    });

    fragment.appendChild(row);
  });

  scheduleBody.replaceChildren(fragment);
  markToday();
}

function populateClassSelect() {
  classSelect.replaceChildren();

  scheduleClasses.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.code;
    option.textContent = item.title || item.code;
    classSelect.appendChild(option);
  });

  classSelect.disabled = scheduleClasses.length === 0;
  classSelect.hidden = scheduleClasses.length <= 1;

  if (scheduleClasses.length === 0) {
    showTableMessage("Google Sheets chưa có dữ liệu thời khóa biểu.");
    return;
  }

  const savedClass = localStorage.getItem(STORAGE_KEY);
  const initialClass = scheduleClasses.some((item) => item.code === savedClass)
    ? savedClass
    : scheduleClasses[0].code;

  classSelect.value = initialClass;
  renderSelectedClass(initialClass);
}

function requestSchedule() {
  if (isLoading) return;

  if (!APPS_SCRIPT_URL.startsWith("https://script.google.com/") ||
      APPS_SCRIPT_URL.includes("DAN_URL_WEB_APP")) {
    setStatus("Chưa cấu hình URL Google Apps Script", "error");
    showTableMessage("Hãy dán URL Web app của Google Apps Script vào biến APPS_SCRIPT_URL trong file script.js.");
    return;
  }

  isLoading = true;
  refreshButton.disabled = true;
  setStatus("Đang đồng bộ Google Sheets...", "loading");

  const callbackName = `scheduleCallback_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const scriptElement = document.createElement("script");
  let finished = false;

  const cleanup = () => {
    finished = true;
    delete window[callbackName];
    scriptElement.remove();
    clearTimeout(timeoutId);
    isLoading = false;
    refreshButton.disabled = false;
  };

  window[callbackName] = (response) => {
    if (finished) return;
    cleanup();

    if (!response || response.success !== true || !Array.isArray(response.classes)) {
      setStatus("Không đọc được dữ liệu Google Sheets", "error");
      showTableMessage(response && response.error ? response.error : "Dữ liệu trả về không hợp lệ.");
      return;
    }

    scheduleClasses = response.classes;
    populateClassSelect();
    setStatus("Đã đồng bộ dữ liệu từ Google Sheets");

    if (response.updatedAt) {
      const updated = new Date(response.updatedAt);
      dataNote.textContent = Number.isNaN(updated.getTime())
        ? "Dữ liệu được tải từ Google Sheets."
        : `Dữ liệu được tải từ Google Sheets lúc ${updated.toLocaleTimeString("vi-VN")} ngày ${updated.toLocaleDateString("vi-VN")}. Tự đồng bộ mỗi 5 phút.`;
    }
  };

  scriptElement.onerror = () => {
    if (finished) return;
    cleanup();
    setStatus("Kết nối thất bại", "error");
    showTableMessage("Không tải được dữ liệu. Hãy kiểm tra URL /exec và quyền triển khai Apps Script.");
  };

  const timeoutId = setTimeout(() => {
    if (finished) return;
    cleanup();
    setStatus("Kết nối quá thời gian", "error");
    showTableMessage("Google Apps Script không phản hồi. Hãy thử bấm Cập nhật hoặc kiểm tra lại đường dẫn.");
  }, 20000);

  const separator = APPS_SCRIPT_URL.includes("?") ? "&" : "?";
  scriptElement.src = `${APPS_SCRIPT_URL}${separator}callback=${callbackName}&t=${Date.now()}`;
  document.head.appendChild(scriptElement);
}

classSelect.addEventListener("change", () => {
  localStorage.setItem(STORAGE_KEY, classSelect.value);
  renderSelectedClass(classSelect.value);
});

refreshButton.addEventListener("click", requestSchedule);

requestSchedule();
setInterval(requestSchedule, REFRESH_INTERVAL_MS);
