const hiveButtons = document.querySelectorAll("#dashboard .hive");
const placeholder = document.getElementById("broodminder-placeholder");
const title = document.getElementById("broodminder-title");
const eyebrow = document.querySelector(".broodminder-head .eyebrow");
const openLink = document.getElementById("broodminder-open");
const placeholderTitle = document.getElementById("broodminder-placeholder-title");

const broodminderLinks = {
  h1: "https://mybroodminder.com/share/hives/6cdd68c9964540638728250b8caaa66c",
  h2: "https://mybroodminder.com/share/hives/e91b8845fd414c468aa0dcbc8a03ddb9",
  h3: "https://mybroodminder.com/share/hives/93ae44c834574c0984f47eae23fa59ad",
  h4: "https://mybroodminder.com/share/hives/0879884755144152a5c9f7a43f512192",
  h5: "https://mybroodminder.com/share/hives/ac354eed3b374582b40d827123ab3afc"
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
