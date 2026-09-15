// Reads UDROP_KEY1 / UDROP_KEY2 from the environment (set as GitHub Actions
// secrets — never written into this file or committed anywhere) and writes
// out udrop-listing.json: a plain snapshot of your whole udrop folder tree.

const KEY1 = process.env.UDROP_KEY1;
const KEY2 = process.env.UDROP_KEY2;
const API = "https://www.udrop.com/api/v2";
const MAX_DEPTH = 12; // safety limit against extremely deep/circular nesting

async function authorize() {
  const res = await fetch(`${API}/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ key1: KEY1, key2: KEY2 }),
  });
  const data = await res.json();
  if (data._status !== "success") {
    throw new Error("Authorization failed: " + JSON.stringify(data));
  }
  return data.data; // { access_token, account_id }
}

async function listFolder(auth, parentFolderId) {
  const params = { access_token: auth.access_token, account_id: auth.account_id };
  if (parentFolderId) params.parent_folder_id = parentFolderId;

  const res = await fetch(`${API}/folder/listing`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (data._status !== "success") {
    throw new Error(`Listing failed for folder "${parentFolderId}": ` + JSON.stringify(data));
  }
  return data.data; // { folders: [...], files: [...] }
}

async function buildTree(auth, folderId, name, depth) {
  if (depth > MAX_DEPTH) {
    return { name, type: "folder", children: [] };
  }

  const { folders = [], files = [] } = await listFolder(auth, folderId);
  const children = [];

  for (const file of files) {
    children.push({
      name: file.filename,
      type: "file",
      url: file.url_file,
      size: Number(file.fileSize) || 0,
    });
  }

  for (const folder of folders) {
    const subtree = await buildTree(auth, folder.id, folder.folderName, depth + 1);
    children.push(subtree);
  }

  return { name, type: "folder", children };
}

async function main() {
  if (!KEY1 || !KEY2) {
    console.error("Missing UDROP_KEY1 / UDROP_KEY2 environment variables.");
    process.exit(1);
  }

  const auth = await authorize();
  const tree = await buildTree(auth, "", "udrop.com", 0);

  const fs = await import("node:fs/promises");
  await fs.writeFile("udrop-listing.json", JSON.stringify(tree, null, 2));
  console.log("Wrote udrop-listing.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
