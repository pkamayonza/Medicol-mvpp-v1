// app.js

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initPage();
  } catch (error) {
    console.error("App crashed:", error);
    showError("Something went wrong. Please refresh.");
  }
});

function showError(message) {
  const loader = document.querySelector(".loading");
  if (loader) {
    loader.innerHTML = `<p style="color:red;">${message}</p>`;
  }
}

function stopLoading() {
  const loader = document.querySelector(".loading");
  if (loader) loader.style.display = "none";
}

function requireAuth() {
  const token = localStorage.getItem("token");

  if (!token) {
    window.location.href = "/login.html";
    return false;
  }

  return true;
}

async function safeFetch(url, options = {}) {
  try {
    const res = await fetch(url, options);

    if (!res.ok) {
      throw new Error(`HTTP error: ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.error("Fetch failed:", err);
    return null;
  }
}