const hiveButtons = document.querySelectorAll("#dashboard .hive");
const placeholder = document.getElementById("broodminder-placeholder");
const title = document.getElementById("broodminder-title");
const eyebrow = document.querySelector(".broodminder-head .eyebrow");
const openLink = document.getElementById("broodminder-open");
const placeholderTitle = document.getElementById("broodminder-placeholder-title");

const broodminderLinks = {
  h1: "https://mybroodminder.com/share/hives/f8e7fb6331aa4edf8e135aa05697ea7b",
  h2: "https://mybroodminder.com/share/hives/4bb858bd3be44ec686ee6a333bf48222",
  h3: "https://mybroodminder.com/share/hives/d9967224e4c844a9a70f1b6b7dac32cf",
  h4: "https://mybroodminder.com/share/hives/1fbe78b3881a43588c835fe490be02fc",
  h5: "https://mybroodminder.com/share/hives/9d7abf7770a6446fbd0a69a21c077453"
};

hiveButtons.forEach((button) => {
  button.addEventListener("click", () => {
    hiveButtons.forEach((b) => b.classList.remove("active"));
    button.classList.add("active");

    const hiveKey = button.dataset.hive;
    const hiveNumber = hiveKey.replace("h", "");
    eyebrow.textContent = `HIVE ${hiveNumber} DATA`;

    if (broodminderLinks[hiveKey]) {
      title.textContent = `Hive ${hiveNumber} BroodMinder monitoring`;
      placeholder.hidden = true;
      openLink.hidden = false;
      openLink.href = broodminderLinks[hiveKey];
      openLink.innerHTML = `VIEW HIVE ${hiveNumber} DATA &amp; GRAPHS ↗`;
    } else {
      title.textContent = `Hive ${hiveNumber}`;
      placeholder.hidden = false;
      openLink.hidden = true;
      placeholderTitle.textContent = `Hive ${hiveNumber} data not connected yet`;
    }
  });
});
