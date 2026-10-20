const { version } = require("../package.json");
const donations = require("./donations.json");
const links = Object.freeze({
  github: "https://github.com/Sanz2610/luma",
  developer: "https://github.com/Sanz2610",
  releases: "https://github.com/Sanz2610/luma/releases/latest",
  source: `https://github.com/Sanz2610/luma/tree/main/source/${version}`,
  notices:
    "https://github.com/Sanz2610/luma/releases/latest/download/THIRD_PARTY_NOTICES.txt",
  donate: donations.paypal,
});
function projectLink(key) {
  if (typeof key !== "string" || !Object.hasOwn(links, key))
    throw new Error("Unknown project link.");
  return links[key];
}
function donationAccount(key) {
  if (typeof key !== "string" || !Object.hasOwn(donations.banks, key))
    throw new Error("Unknown donation account.");
  return donations.banks[key].account;
}
module.exports = { projectLink, donationAccount };
