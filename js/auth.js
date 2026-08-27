// ============================================
// LOGIN / SIGNUP LOGIC
// ============================================

const form = document.getElementById("auth-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitBtn = document.getElementById("submit-btn");
const modeLabel = document.getElementById("mode-label");
const switchBtn = document.getElementById("switch-btn");
const subtitle = document.getElementById("subtitle");
const message = document.getElementById("form-message");

let mode = "login"; // or "signup"

function showMessage(text, type) {
  message.textContent = text;
  message.className = `form-message show ${type}`;
}

function clearMessage() {
  message.className = "form-message";
}

switchBtn.addEventListener("click", () => {
  mode = mode === "login" ? "signup" : "login";
  clearMessage();
  if (mode === "signup") {
    submitBtn.textContent = "Begin your story";
    modeLabel.textContent = "Already have an account?";
    switchBtn.textContent = "Sign in";
    subtitle.textContent = "Create an account to start your first book.";
  } else {
    submitBtn.textContent = "Enter the library";
    modeLabel.textContent = "New here?";
    switchBtn.textContent = "Create an account";
    subtitle.textContent = "Sign in to return to your shelf.";
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMessage();
  submitBtn.disabled = true;
  submitBtn.textContent = "One moment…";

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      showMessage(
        "Almost there — check your email to confirm your account.",
        "success"
      );
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Success — head to the library
      window.location.href = "index.html";
    }
  } catch (err) {
    showMessage(err.message || "Something went wrong. Try again.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = mode === "signup" ? "Begin your story" : "Enter the library";
  }
});

// If already logged in, skip straight to the library
supabase.auth.getSession().then(({ data }) => {
  if (data.session) {
    window.location.href = "index.html";
  }
});
