// ============================================
// ACCOUNT MODAL — powers the "power" button.
// Logged out  -> login / sign up tabs
// Logged in   -> shows email + log out button
// ============================================

function initAccountModal() {
  const backdrop = document.getElementById("account-backdrop");
  const openBtn = document.getElementById("account-btn");

  const guestView = document.getElementById("account-guest-view");
  const signedInView = document.getElementById("account-signed-in-view");

  const tabLogin = document.getElementById("account-tab-login");
  const tabSignup = document.getElementById("account-tab-signup");
  const confirmField = document.getElementById("account-confirm-field");
  const errorEl = document.getElementById("account-error");

  const emailInput = document.getElementById("account-email");
  const passwordInput = document.getElementById("account-password");
  const confirmInput = document.getElementById("account-confirm");

  const submitBtn = document.getElementById("account-submit-btn");
  const closeBtn = document.getElementById("account-close-btn");
  const signedInCloseBtn = document.getElementById("account-signedin-close-btn");
  const logoutBtn = document.getElementById("account-logout-btn");
  const emailDisplay = document.getElementById("account-email-display");

  // FIX: if any required element is missing from the page (e.g. an id
  // typo, or this script loading on a page that doesn't have the account
  // modal markup), the old code would throw the moment it tried to call
  // .addEventListener on `undefined` — and because that throw happened
  // outside any try/catch, it silently killed the rest of this script,
  // including the openBtn listener. That's the most likely reason
  // clicking the button did "nothing": the click handler was never
  // attached in the first place. This check makes that failure visible
  // in the console instead of failing silently.
  const required = {
    backdrop, openBtn, guestView, signedInView, tabLogin, tabSignup,
    confirmField, errorEl, emailInput, passwordInput, confirmInput,
    submitBtn, closeBtn, signedInCloseBtn, logoutBtn, emailDisplay
  };
  const missing = Object.entries(required).filter(([, el]) => !el).map(([name]) => name);
  if (missing.length > 0) {
    console.error(
      "Account modal failed to initialize — missing element(s) in the HTML:",
      missing.join(", "),
      "\nCheck that these ids exist exactly (case-sensitive) in index.html."
    );
    return; // bail out cleanly instead of throwing
  }

  let mode = "login"; // "login" | "signup"

  function clearError() {
    errorEl.textContent = "";
    errorEl.classList.remove("show");
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.add("show");
  }

  function setMode(newMode) {
    mode = newMode;
    clearError();
    tabLogin.classList.toggle("active", mode === "login");
    tabSignup.classList.toggle("active", mode === "signup");
    confirmField.style.display = mode === "signup" ? "" : "none";
    submitBtn.textContent = mode === "signup" ? "Sign up" : "Log in";
  }

  async function open() {
    // Always show the modal first, so a Supabase error below still
    // leaves the user with a visible, readable error instead of the
    // button silently doing nothing.
    clearError();
    emailInput.value = "";
    passwordInput.value = "";
    confirmInput.value = "";
    setMode("login");
    backdrop.classList.add("show");

    try {
      if (typeof supabase === "undefined" || !supabase.auth) {
        throw new Error("Couldn't connect to the account service. Check that your Supabase project isn't paused and reload the page.");
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        guestView.style.display = "none";
        signedInView.style.display = "";
        emailDisplay.textContent = session.user.email;
      } else {
        guestView.style.display = "";
        signedInView.style.display = "none";
      }
    } catch (err) {
      console.error("Account modal failed to open cleanly:", err);
      guestView.style.display = "";
      signedInView.style.display = "none";
      showError(err.message || "Something went wrong. Try reloading the page.");
    }
  }

  function close() {
    backdrop.classList.remove("show");
  }

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  signedInCloseBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  tabLogin.addEventListener("click", () => setMode("login"));
  tabSignup.addEventListener("click", () => setMode("signup"));

  submitBtn.addEventListener("click", async () => {
    clearError();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError("Enter both an email and a password.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = mode === "signup" ? "Signing up…" : "Logging in…";

    try {
      if (mode === "signup") {
        if (password !== confirmInput.value) {
          showError("Passwords don't match.");
          return;
        }
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          showError(error.message);
          return;
        }
        // If email confirmation is on, there won't be a session yet.
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          showError("Check your email to confirm your account, then log in.");
          setMode("login");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          showError(error.message);
          return;
        }
      }

      // Success — reload so the library re-runs its normal signed-in flow.
      window.location.reload();
    } catch (err) {
      showError(err.message || "Something went wrong. Try again.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = mode === "signup" ? "Sign up" : "Log in";
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.reload();
  });

  console.log("Account modal initialized OK.");
}

initAccountModal();
