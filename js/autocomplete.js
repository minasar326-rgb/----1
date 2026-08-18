/**
 * Church QR Attendance System - Smart Autocomplete Component
 * Provides live instant student suggestions dropdown attached to search inputs
 */

import { searchStudentsAutocomplete } from "./students.js";

/**
 * Initializes interactive Autocomplete on a target input
 */
export function initStudentAutocomplete({
  input,
  onSelect,
  placeholder = "ابحث بالاسم أو كود الطالب...",
  maxResults = 8
}) {
  const inputEl = typeof input === "string" ? document.querySelector(input) : input;
  if (!inputEl) return null;

  // Wrap or ensure relative positioning parent
  let wrapper = inputEl.closest(".autocomplete-wrapper");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "autocomplete-wrapper";
    wrapper.style.position = "relative";
    wrapper.style.width = "100%";
    inputEl.parentNode.insertBefore(wrapper, inputEl);
    wrapper.appendChild(inputEl);
  }

  // Create dropdown container
  let dropdown = wrapper.querySelector(".autocomplete-dropdown");
  if (!dropdown) {
    dropdown = document.createElement("div");
    dropdown.className = "autocomplete-dropdown";
    dropdown.style.cssText = `
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      left: 0;
      background: var(--bg-surface, #ffffff);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: var(--radius-md, 10px);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      z-index: 1050;
      max-height: 320px;
      overflow-y: auto;
      display: none;
      padding: 0.35rem 0;
    `;
    wrapper.appendChild(dropdown);
  }

  let selectedIndex = -1;
  let currentResults = [];
  let debounceTimer = null;

  async function handleInput() {
    const val = inputEl.value.trim();
    if (!val) {
      hideDropdown();
      return;
    }

    currentResults = await searchStudentsAutocomplete(val, maxResults);
    selectedIndex = -1;

    if (currentResults.length === 0) {
      dropdown.innerHTML = `
        <div style="padding: 0.75rem 1rem; text-align: center; color: var(--text-muted); font-size: 0.875rem;">
          <i class="fa-solid fa-user-slash" style="margin-left: 6px;"></i> لا توجد نتائج مطابقة لـ "${val}"
        </div>
      `;
      dropdown.style.display = "block";
      return;
    }

    renderItems(val);
    dropdown.style.display = "block";
  }

  function renderItems(queryVal) {
    dropdown.innerHTML = currentResults.map((s, idx) => {
      const isSelected = idx === selectedIndex;
      const code = s.studentCode || s.studentId;
      return `
        <div 
          class="autocomplete-item ${isSelected ? 'active' : ''}" 
          data-index="${idx}"
          style="
            padding: 0.6rem 1rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            border-bottom: 1px solid var(--border-light, #f1f5f9);
            background: ${isSelected ? 'var(--primary-50, #eef2ff)' : 'transparent'};
            transition: background 0.15s ease;
          "
        >
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div style="
              width: 32px; height: 32px; border-radius: 50%;
              background: var(--primary-100, #e0e7ff);
              color: var(--primary-700, #4338ca);
              display: flex; align-items: center; justify-content: center;
              font-weight: bold; font-size: 0.85rem;
            ">
              ${s.name.charAt(0)}
            </div>
            <div>
              <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-main, #1e293b);">
                ${highlightMatch(s.name, queryVal)}
              </div>
              <div style="font-size: 0.75rem; color: var(--text-muted, #64748b);">
                ${s.grade}
              </div>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="badge badge-gold" style="font-size: 0.72rem; font-family: monospace;">
              <i class="fa-solid fa-id-card"></i> ${s.studentCode || s.studentId}
            </span>
            <span class="badge ${s.status === 'active' ? 'badge-present' : 'badge-absent'}" style="font-size: 0.7rem; padding: 2px 6px;">
              ${s.status === 'active' ? 'نشط' : 'معطل'}
            </span>
          </div>
        </div>
      `;
    }).join("");

    // Attach item clicks
    dropdown.querySelectorAll(".autocomplete-item").forEach(item => {
      item.addEventListener("click", () => {
        const idx = parseInt(item.dataset.index, 10);
        selectItem(idx);
      });
      item.addEventListener("mouseenter", () => {
        dropdown.querySelectorAll(".autocomplete-item").forEach(i => i.style.background = 'transparent');
        item.style.background = 'var(--primary-50, #eef2ff)';
        selectedIndex = parseInt(item.dataset.index, 10);
      });
    });
  }

  function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${escapeRegExp(query)})`, "gi");
    return text.replace(regex, `<mark style="background: #fef08a; padding: 0 2px; border-radius: 2px; color: inherit;">$1</mark>`);
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function selectItem(index) {
    if (index >= 0 && index < currentResults.length) {
      const student = currentResults[index];
      inputEl.value = student.name;
      hideDropdown();
      if (typeof onSelect === "function") {
        onSelect(student);
      }
    }
  }

  function hideDropdown() {
    dropdown.style.display = "none";
    selectedIndex = -1;
  }

  // Keyboard navigation
  inputEl.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleInput, 150);
  });

  inputEl.addEventListener("focus", () => {
    if (inputEl.value.trim()) handleInput();
  });

  inputEl.addEventListener("keydown", (e) => {
    if (dropdown.style.display !== "block" || currentResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % currentResults.length;
      renderItems(inputEl.value.trim());
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
      renderItems(inputEl.value.trim());
    } else if (e.key === "Enter") {
      if (selectedIndex >= 0) {
        e.preventDefault();
        selectItem(selectedIndex);
      }
    } else if (e.key === "Escape") {
      hideDropdown();
    }
  });

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) {
      hideDropdown();
    }
  });

  return {
    hide: hideDropdown,
    refresh: handleInput
  };
}
