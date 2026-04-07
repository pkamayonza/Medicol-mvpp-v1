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