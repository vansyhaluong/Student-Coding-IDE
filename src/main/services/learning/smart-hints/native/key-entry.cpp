// Windows-only Main-process credential input. No Electron Renderer or child pipe.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <node_api.h>
#include <atomic>
#include <cstdint>

struct Entry {
  napi_env env{}; napi_deferred deferred{}; napi_async_work work{};
  HWND owner{}, window{}, edit{}; bool accepted = false, failed = false;
  wchar_t secret[4097]{};
};
static std::atomic<HWND> activeWindow{nullptr};
static std::atomic<bool> active{false};
static std::atomic<bool> cancelling{false};
static LRESULT CALLBACK procedure(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
  auto* entry = reinterpret_cast<Entry*>(GetWindowLongPtrW(window, GWLP_USERDATA));
  if (message == WM_NCCREATE) {
    entry = static_cast<Entry*>(reinterpret_cast<CREATESTRUCTW*>(lparam)->lpCreateParams);
    SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(entry));
  }
  if (!entry) return DefWindowProcW(window, message, wparam, lparam);
  if (message == WM_CREATE) {
    CreateWindowW(L"STATIC", L"Gemini API Key (chi xu ly trong Electron Main)", WS_CHILD | WS_VISIBLE,
      18, 16, 490, 24, window, nullptr, nullptr, nullptr);
    entry->edit = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", L"", WS_CHILD | WS_VISIBLE | WS_TABSTOP | ES_PASSWORD | ES_AUTOHSCROLL,
      18, 44, 490, 28, window, reinterpret_cast<HMENU>(100), nullptr, nullptr);
    SendMessageW(entry->edit, EM_SETLIMITTEXT, 4097, 0);
    CreateWindowW(L"STATIC", L"Luu ma hoa bang Windows DPAPI. Khong dan key vao chat.", WS_CHILD | WS_VISIBLE,
      18, 84, 490, 24, window, nullptr, nullptr, nullptr);
    CreateWindowW(L"BUTTON", L"Cancel", WS_CHILD | WS_VISIBLE | WS_TABSTOP,
      300, 124, 94, 30, window, reinterpret_cast<HMENU>(IDCANCEL), nullptr, nullptr);
    CreateWindowW(L"BUTTON", L"Save key", WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_DEFPUSHBUTTON,
      408, 124, 100, 30, window, reinterpret_cast<HMENU>(IDOK), nullptr, nullptr);
    return 0;
  }
  if (message == WM_COMMAND) {
    if (LOWORD(wparam) == IDOK) {
      if (GetWindowTextLengthW(entry->edit) > 4096) {
        MessageBoxW(window, L"API key exceeds the supported size. Nothing was saved.", L"Gemini API Key", MB_OK | MB_ICONWARNING); return 0;
      }
      GetWindowTextW(entry->edit, entry->secret, 4097);
      entry->accepted = true; SetWindowTextW(entry->edit, L""); DestroyWindow(window); return 0;
    }
    if (LOWORD(wparam) == IDCANCEL) { DestroyWindow(window); return 0; }
  }
  if (message == WM_CLOSE) { DestroyWindow(window); return 0; }
  return DefWindowProcW(window, message, wparam, lparam);
}
static void execute(napi_env, void* data) {
  auto* entry = static_cast<Entry*>(data);
  const HINSTANCE instance = GetModuleHandleW(nullptr);
  WNDCLASSW type{}; type.lpfnWndProc = procedure; type.hInstance = instance;
  type.lpszClassName = L"StudentIdeSmartHintsKeyEntry"; type.hCursor = LoadCursorW(nullptr, IDC_ARROW);
  type.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_BTNFACE + 1);
  if (!RegisterClassW(&type) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) { entry->failed = true; return; }
  if (cancelling.load()) return;
  RECT parent{}; if (!GetWindowRect(entry->owner, &parent)) { parent.right = GetSystemMetrics(SM_CXSCREEN); parent.bottom = GetSystemMetrics(SM_CYSCREEN); }
  entry->window = CreateWindowExW(WS_EX_DLGMODALFRAME | WS_EX_CONTROLPARENT | WS_EX_TOPMOST,
    type.lpszClassName, L"Student Coding IDE - Gemini API Key", WS_CAPTION | WS_SYSMENU | WS_POPUP,
    parent.left + (parent.right - parent.left - 550) / 2, parent.top + (parent.bottom - parent.top - 210) / 2,
    550, 210, entry->owner, nullptr, instance, entry);
  if (!entry->window) { entry->failed = true; return; }
  activeWindow.store(entry->window);
  if (cancelling.load()) { DestroyWindow(entry->window); activeWindow.store(nullptr); return; }
  EnableWindow(entry->owner, FALSE); ShowWindow(entry->window, SW_SHOW); SetForegroundWindow(entry->window); SetFocus(entry->edit);
  MSG message{};
  while (IsWindow(entry->window) && GetMessageW(&message, nullptr, 0, 0) > 0) {
    if (!IsDialogMessageW(entry->window, &message)) { TranslateMessage(&message); DispatchMessageW(&message); }
  }
  activeWindow.store(nullptr);
  if (IsWindow(entry->owner)) { EnableWindow(entry->owner, TRUE); SetForegroundWindow(entry->owner); }
}
static void complete(napi_env env, napi_status status, void* data) {
  auto* entry = static_cast<Entry*>(data); napi_value value{};
  if (status != napi_ok || entry->failed) {
    napi_create_string_utf8(env, "Secure key entry unavailable.", NAPI_AUTO_LENGTH, &value);
    napi_value error{}; napi_create_error(env, nullptr, value, &error); napi_reject_deferred(env, entry->deferred, error);
  } else {
    if (entry->accepted) napi_create_string_utf16(env, reinterpret_cast<char16_t*>(entry->secret), NAPI_AUTO_LENGTH, &value);
    else napi_get_null(env, &value);
    napi_resolve_deferred(env, entry->deferred, value);
  }
  SecureZeroMemory(entry->secret, sizeof(entry->secret)); napi_delete_async_work(env, entry->work); delete entry; active.store(false);
}
static napi_value prompt(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value args[1]{}; napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  bool buffer = false; if (count == 1) napi_is_buffer(env, args[0], &buffer);
  if (!buffer || active.exchange(true)) { napi_throw_error(env, nullptr, "Secure key entry busy or invalid owner."); return nullptr; }
  void* bytes{}; size_t size = 0; napi_get_buffer_info(env, args[0], &bytes, &size);
  if (size != sizeof(HWND)) { active.store(false); napi_throw_error(env, nullptr, "Invalid key entry owner."); return nullptr; }
  auto* entry = new Entry(); entry->env = env; CopyMemory(&entry->owner, bytes, sizeof(HWND));
  if (!IsWindow(entry->owner)) { delete entry; active.store(false); napi_throw_error(env, nullptr, "Key entry owner unavailable."); return nullptr; }
  cancelling.store(false); napi_value result{}, label{}; napi_create_promise(env, &entry->deferred, &result);
  napi_create_string_utf8(env, "SmartHintsSecureKeyEntry", NAPI_AUTO_LENGTH, &label);
  if (napi_create_async_work(env, nullptr, label, execute, complete, entry, &entry->work) != napi_ok
    || napi_queue_async_work(env, entry->work) != napi_ok) {
    if (entry->work) napi_delete_async_work(env, entry->work);
    SecureZeroMemory(entry->secret, sizeof(entry->secret)); delete entry; active.store(false);
    napi_throw_error(env, nullptr, "Secure key entry unavailable."); return nullptr;
  }
  return result;
}
static napi_value cancel(napi_env env, napi_callback_info) {
  cancelling.store(true); const auto window = activeWindow.load(); if (window) PostMessageW(window, WM_CLOSE, 0, 0);
  napi_value result{}; napi_get_undefined(env, &result); return result;
}
static napi_value init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {{"prompt", nullptr, prompt, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"cancel", nullptr, cancel, nullptr, nullptr, nullptr, napi_default, nullptr}};
  napi_define_properties(env, exports, 2, properties); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
