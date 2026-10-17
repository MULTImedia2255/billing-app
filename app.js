/**
 * SOUTH INDIAN SAW MILL - SALES BILLING & TALLY ENGINE
 * Mobile-Optimized SaaS Billing System with 1:1 Tally Print Mirror
 */

const STATE_CODES = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
  "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
  "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
  "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "27": "Maharashtra", "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa",
  "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman & Nicobar", "36": "Telangana", "37": "Andhra Pradesh (New)", "38": "Ladakh"
};

const DEFAULT_COMPANY = {
  name: "",
  address: "",
  udayam: "",
  gstin: "",
  state: "",
  stateCode: "",
  sealImg: "",
  signImg: ""
};

const DEFAULT_PARTIES = [
  {
    id: "p1",
    name: "K P J Timbers",
    address: "49, JOTHI TALKIES ROAD\nAmmapettai, Salem\nSalem, Tamil Nadu\n636003",
    gstin: "33AAQFK2372M1ZX",
    state: "Tamil Nadu",
    stateCode: "33"
  },
  {
    id: "p2",
    name: "Cochin Timber Traders",
    address: "Building No. 12/450\nMarket Road, Aluva\nErnakulam, Kerala\n683101",
    gstin: "32AAAAA0000A1Z5",
    state: "Kerala",
    stateCode: "32"
  }
];

const DEFAULT_AUTH = {
  username: "admin",
  password: "admin123"
};

let memorySessionLoggedIn = false;

function safeGetLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function safeSetLocal(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (err) {
    // Ignore storage restriction on mobile content:// viewer
  }
}

function safeGetSessionLogin() {
  try {
    return sessionStorage.getItem("sism_logged_in") === "true" || memorySessionLoggedIn;
  } catch (err) {
    return memorySessionLoggedIn;
  }
}

function safeSetSessionLogin(loggedIn) {
  memorySessionLoggedIn = loggedIn;
  try {
    if (loggedIn) {
      sessionStorage.setItem("sism_logged_in", "true");
    } else {
      sessionStorage.removeItem("sism_logged_in");
    }
  } catch (err) {
    // Ignore storage restriction on mobile content:// viewer
  }
}

let companyProfile = safeGetLocal("billing_company_v2", DEFAULT_COMPANY);
let partiesList = safeGetLocal("sism_parties", DEFAULT_PARTIES);
let savedInvoices = safeGetLocal("sism_invoices", []);
let authCredentials = safeGetLocal("sism_auth", DEFAULT_AUTH);

// -------------------------------------------------------------
// SUPABASE CLOUD DATABASE CONFIGURATION & SYNC ENGINE
// -------------------------------------------------------------
const SUPABASE_URL = "https://tnznjdcbrikfbsrgipya.supabase.co";
const SUPABASE_KEY = "sb_publishable_mlJhZQX6axbMOJC3M4Z6IQ_BX-0nW6c";
let liveCompanySyncTimer = null;

function supabaseHeaders(preferHeader) {
  const headers = {
    "apikey": SUPABASE_KEY,
    "Content-Type": "application/json"
  };
  if (preferHeader) {
    headers["Prefer"] = preferHeader;
  }
  return headers;
}

async function pushSettingsToSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/billing_settings?on_conflict=id`, {
      method: "POST",
      headers: supabaseHeaders("resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify({
        id: 1,
        company_profile: companyProfile,
        auth_credentials: authCredentials,
        updated_at: new Date().toISOString()
      })
    });
  } catch (err) {
    console.warn("Supabase settings sync deferred:", err);
  }
}

async function pushPartyToSupabase(party) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !party || !party.id) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/billing_parties?on_conflict=id`, {
      method: "POST",
      headers: supabaseHeaders("resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify({
        id: String(party.id),
        name: party.name || "",
        address: party.address || "",
        gstin: party.gstin || "",
        state: party.state || "",
        state_code: party.stateCode || "",
        updated_at: new Date().toISOString()
      })
    });
  } catch (err) {
    console.warn("Supabase party sync deferred:", err);
  }
}

async function pushAllPartiesToSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !Array.isArray(partiesList) || !partiesList.length) return;
  try {
    const payload = partiesList.map(p => ({
      id: String(p.id),
      name: p.name || "",
      address: p.address || "",
      gstin: p.gstin || "",
      state: p.state || "",
      state_code: p.stateCode || "",
      updated_at: new Date().toISOString()
    }));
    await fetch(`${SUPABASE_URL}/rest/v1/billing_parties?on_conflict=id`, {
      method: "POST",
      headers: supabaseHeaders("resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn("Supabase bulk parties sync deferred:", err);
  }
}

async function deletePartyFromSupabase(id) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !id) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/billing_parties?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: supabaseHeaders()
    });
  } catch (err) {
    console.warn("Supabase party delete deferred:", err);
  }
}

async function pushInvoiceToSupabase(inv) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !inv || !inv.invNo) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/billing_invoices?on_conflict=inv_no`, {
      method: "POST",
      headers: supabaseHeaders("resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify({
        inv_no: String(inv.invNo),
        inv_date: inv.invDate || "",
        vehicle_no: inv.vehicleNo || "",
        buyer_name: (inv.buyer && inv.buyer.name) ? inv.buyer.name : "",
        grand_total: (inv.totals && inv.totals.grandTotal) ? Number(inv.totals.grandTotal) : 0,
        invoice_data: inv,
        saved_at: inv.savedAt || new Date().toISOString()
      })
    });
  } catch (err) {
    console.warn("Supabase invoice sync deferred:", err);
  }
}

async function pushAllInvoicesToSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !Array.isArray(savedInvoices) || !savedInvoices.length) return;
  try {
    const payload = savedInvoices.map(inv => ({
      inv_no: String(inv.invNo),
      inv_date: inv.invDate || "",
      vehicle_no: inv.vehicleNo || "",
      buyer_name: (inv.buyer && inv.buyer.name) ? inv.buyer.name : "",
      grand_total: (inv.totals && inv.totals.grandTotal) ? Number(inv.totals.grandTotal) : 0,
      invoice_data: inv,
      saved_at: inv.savedAt || new Date().toISOString()
    }));
    await fetch(`${SUPABASE_URL}/rest/v1/billing_invoices?on_conflict=inv_no`, {
      method: "POST",
      headers: supabaseHeaders("resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn("Supabase bulk invoices sync deferred:", err);
  }
}

async function deleteInvoiceFromSupabase(invNo) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !invNo) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/billing_invoices?inv_no=eq.${encodeURIComponent(invNo)}`, {
      method: "DELETE",
      headers: supabaseHeaders()
    });
  } catch (err) {
    console.warn("Supabase invoice delete deferred:", err);
  }
}

async function syncFromSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    // 1. Fetch Company Settings & Auth Credentials
    const setRes = await fetch(`${SUPABASE_URL}/rest/v1/billing_settings?id=eq.1&select=*`, {
      method: "GET",
      headers: supabaseHeaders()
    });
    if (setRes.ok) {
      const setRows = await setRes.json();
      if (Array.isArray(setRows) && setRows.length > 0) {
        const row = setRows[0];
        if (row.company_profile && typeof row.company_profile === "object") {
          companyProfile = Object.assign({}, DEFAULT_COMPANY, row.company_profile);
          safeSetLocal("billing_company_v2", companyProfile);
        }
        if (row.auth_credentials && row.auth_credentials.username && row.auth_credentials.password) {
          authCredentials = row.auth_credentials;
          safeSetLocal("sism_auth", authCredentials);
        }
      } else if (companyProfile && companyProfile.name) {
        // Seed initial local company profile to Supabase if table is empty
        pushSettingsToSupabase();
      }
    }

    // 2. Fetch Parties
    const partyRes = await fetch(`${SUPABASE_URL}/rest/v1/billing_parties?select=*&order=updated_at.asc`, {
      method: "GET",
      headers: supabaseHeaders()
    });
    if (partyRes.ok) {
      const partyRows = await partyRes.json();
      if (Array.isArray(partyRows) && partyRows.length > 0) {
        partiesList = partyRows.map(r => ({
          id: r.id,
          name: r.name || "",
          address: r.address || "",
          gstin: r.gstin || "",
          state: r.state || "",
          stateCode: r.state_code || ""
        }));
        safeSetLocal("sism_parties", partiesList);
      } else if (partiesList && partiesList.length > 0) {
        pushAllPartiesToSupabase();
      }
    }

    // 3. Fetch Saved Invoices
    const invRes = await fetch(`${SUPABASE_URL}/rest/v1/billing_invoices?select=*&order=saved_at.desc`, {
      method: "GET",
      headers: supabaseHeaders()
    });
    if (invRes.ok) {
      const invRows = await invRes.json();
      if (Array.isArray(invRows) && invRows.length > 0) {
        savedInvoices = invRows
          .map(r => r.invoice_data)
          .filter(d => d && typeof d === "object" && d.invNo);
        safeSetLocal("sism_invoices", savedInvoices);
      } else if (savedInvoices && savedInvoices.length > 0) {
        pushAllInvoicesToSupabase();
      }
    }

    // Refresh UI after cloud sync
    syncCompanyBranding();
    populatePartiesDatalist();
    renderPartiesTable();
    renderHistoryTable();
    renderHomeRecent();
    renderBackupSummary();
  } catch (err) {
    console.warn("Supabase initial sync skipped or offline:", err);
  }
}


let invoiceItems = [
  {
    desc: "Mahagany Reeper and Battons",
    hsn: "4407",
    qty: 13.600,
    unit: "CBM",
    rate: 7000.00,
    taxRate: 18
  }
];

let currentZoom = 1.0;

// -------------------------------------------------------------
// HELPER: Date Formatting & Currency & Number to Words
// -------------------------------------------------------------
function formatTallyDate(isoDateStr) {
  if (!isoDateStr) return "";
  const parts = isoDateStr.split("-");
  if (parts.length < 3) return isoDateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parts[2];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mName = months[monthIdx] || parts[1];
  const yShort = year.length === 4 ? year.slice(-2) : year;
  return `${day}-${mName}-${yShort}`;
}

function getTodayIsoDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatINR(val) {
  if (isNaN(val) || val === null) return "0.00";
  const num = Math.round(Number(val) * 100) / 100;
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function numberToWordsINR(amount) {
  if (isNaN(amount) || amount === null || amount === 0) return "INR Zero Only";

  const num = Math.round(amount * 100) / 100;
  const parts = num.toFixed(2).split(".");
  let rupees = parseInt(parts[0], 10);
  let paise = parseInt(parts[1], 10);

  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
  ];

  function convertTwoDigits(n) {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    let t = Math.floor(n / 10);
    let o = n % 10;
    return (tens[t] + " " + ones[o]).trim();
  }

  function convertThreeDigits(n) {
    let hundred = Math.floor(n / 100);
    let rest = n % 100;
    let str = "";
    if (hundred > 0) {
      str += ones[hundred] + " Hundred";
    }
    if (rest > 0) {
      if (str !== "") str += " ";
      str += convertTwoDigits(rest);
    }
    return str;
  }

  let words = "";

  // Crores (>= 1,00,00,000)
  if (rupees >= 10000000) {
    let cr = Math.floor(rupees / 10000000);
    words += convertThreeDigits(cr) + " Crore ";
    rupees %= 10000000;
  }

  // Lakhs (>= 1,00,000)
  if (rupees >= 100000) {
    let lk = Math.floor(rupees / 100000);
    words += convertTwoDigits(lk) + " Lakh ";
    rupees %= 100000;
  }

  // Thousands (>= 1,000)
  if (rupees >= 1000) {
    let th = Math.floor(rupees / 1000);
    words += convertTwoDigits(th) + " Thousand ";
    rupees %= 1000;
  }

  // Hundreds & Below
  if (rupees > 0) {
    words += convertThreeDigits(rupees);
  }

  words = words.trim();
  let result = "INR " + (words || "Zero");

  if (paise > 0) {
    result += " and " + convertTwoDigits(paise) + " Paise";
  }

  result += " Only";
  return result.replace(/\s+/g, " ");
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// -------------------------------------------------------------
// NAVIGATION DRAWER & TAB SWITCHING
// -------------------------------------------------------------
function toggleNavDrawer() {
  const drawer = document.getElementById("navDrawer");
  const backdrop = document.getElementById("navDrawerBackdrop");
  drawer.classList.toggle("hidden");
  backdrop.classList.toggle("hidden");
}

function navFromDrawer(viewName) {
  toggleNavDrawer();
  navigateTo(viewName);
}

function navigateTo(viewName) {
  const views = ["home", "billing", "parties", "history", "settings"];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.remove("active");
    const dlink = document.getElementById(`dlink-${v}`);
    if (dlink) dlink.classList.remove("active");
  });

  const activeView = document.getElementById(`view-${viewName}`);
  if (activeView) activeView.classList.add("active");

  const activeDlink = document.getElementById(`dlink-${viewName}`);
  if (activeDlink) activeDlink.classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });

  syncCompanyBranding();

  if (viewName === "home") renderHomeRecent();
  if (viewName === "parties") renderPartiesTable();
  if (viewName === "history") renderHistoryTable();
  if (viewName === "settings") {
    showSettingsMenu();
    loadSettingsForm();
  }
}

// -------------------------------------------------------------
// INVOICE DATES & FORM HANDLERS
// -------------------------------------------------------------
function onDatePicked(isoVal) {
  document.getElementById("invDate").value = formatTallyDate(isoVal);
}

function onOrderDatePicked(isoVal) {
  document.getElementById("buyerOrderDate").value = formatTallyDate(isoVal);
}

function onDeliveryDatePicked(isoVal) {
  document.getElementById("deliveryNoteDate").value = formatTallyDate(isoVal);
}

function toggleMoreOptions() {
  const content = document.getElementById("moreOptionsContent");
  const arrow = document.getElementById("moreOptionsArrow");
  if (content.classList.contains("hidden")) {
    content.classList.remove("hidden");
    arrow.textContent = "▲";
  } else {
    content.classList.add("hidden");
    arrow.textContent = "▼";
  }
}

function toggleManualTaxOption() {
  const box = document.getElementById("manualTaxControls");
  box.classList.toggle("hidden");
}

function onManualTaxChange() {
  calculateTotals();
}

// -------------------------------------------------------------
// PARTY AUTOCOMPLETION & STATE DETECTION
// -------------------------------------------------------------
function populatePartiesDatalist() {
  const dlistBuyer = document.getElementById("partiesDatalist");
  const dlistConsignee = document.getElementById("partiesDatalistConsignee");
  if (!dlistBuyer || !dlistConsignee) return;

  dlistBuyer.innerHTML = "";
  dlistConsignee.innerHTML = "";

  partiesList.forEach(p => {
    const optB = document.createElement("option");
    optB.value = p.name;
    dlistBuyer.appendChild(optB);

    const optC = document.createElement("option");
    optC.value = p.name;
    dlistConsignee.appendChild(optC);
  });
}

function onBuyerNameInput(val) {
  const party = partiesList.find(p => p.name.toLowerCase() === val.trim().toLowerCase());
  if (party) {
    document.getElementById("buyerAddress").value = party.address;
    document.getElementById("buyerGstin").value = party.gstin;
    document.getElementById("buyerState").value = party.state;
    document.getElementById("buyerStateCode").value = party.stateCode;

    // If consignee is blank, sync with buyer
    const cName = document.getElementById("consigneeName").value.trim();
    if (!cName) {
      document.getElementById("consigneeName").value = party.name;
      document.getElementById("consigneeAddress").value = party.address;
      document.getElementById("consigneeGstin").value = party.gstin;
      document.getElementById("consigneeState").value = party.state;
      document.getElementById("consigneeStateCode").value = party.stateCode;
    }
    calculateTotals();
  }
}

function onConsigneeNameInput(val) {
  const party = partiesList.find(p => p.name.toLowerCase() === val.trim().toLowerCase());
  if (party) {
    document.getElementById("consigneeAddress").value = party.address;
    document.getElementById("consigneeGstin").value = party.gstin;
    document.getElementById("consigneeState").value = party.state;
    document.getElementById("consigneeStateCode").value = party.stateCode;
  }
}

function autoDetectStateFromGstin(gstinVal, stateElId, codeElId) {
  const clean = gstinVal.trim().toUpperCase();
  if (clean.length >= 2) {
    const code = clean.substring(0, 2);
    if (STATE_CODES[code]) {
      const stateEl = document.getElementById(stateElId);
      const codeEl = document.getElementById(codeElId);
      if (stateEl) stateEl.value = STATE_CODES[code];
      if (codeEl) codeEl.value = code;
    }
  }
}

function onGstinInput(val) {
  autoDetectStateFromGstin(val, "buyerState", "buyerStateCode");
  onStateCodeChange();
}

function onStateCodeChange() {
  const code = document.getElementById("buyerStateCode").value.trim();
  if (STATE_CODES[code] && !document.getElementById("buyerState").value) {
    document.getElementById("buyerState").value = STATE_CODES[code];
  }
  calculateTotals();
}

// -------------------------------------------------------------
// COMPACT 2-LINE PRODUCT ITEMS (Fast Single-Screen Data Entry)
// -------------------------------------------------------------
function renderItemsForm() {
  const container = document.getElementById("itemsContainer");
  if (!container) return;
  container.innerHTML = "";

  invoiceItems.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "compact-item-row";
    const lineTotal = (item.qty || 0) * (item.rate || 0);

    row.innerHTML = `
      <!-- Line 1: Description + HSN + Delete -->
      <div class="item-line-1">
        <div class="form-field item-desc-field">
          <label>Description of Goods <span class="req">*</span></label>
          <input type="text" class="item-desc-input" value="${escapeHtml(item.desc)}" 
                 placeholder="Description of Goods / Timber..." 
                 oninput="updateItemField(${index}, 'desc', this.value)" required>
        </div>
        <div class="form-field item-hsn-field">
          <label>HSN/SAC</label>
          <input type="text" class="item-hsn-input" value="${escapeHtml(item.hsn || '4407')}" 
                 placeholder="4407" title="HSN/SAC Code"
                 oninput="updateItemField(${index}, 'hsn', this.value)">
        </div>
        ${invoiceItems.length > 1 ? `<button type="button" class="item-del-btn" onclick="removeItemRow(${index})" title="Delete item">&times;</button>` : ''}
      </div>

      <!-- Line 2: Qty, Unit, Rate, Tax%, Total -->
      <div class="item-line-2">
        <div class="form-field item-field-wrap">
          <label>Quantity <span class="req">*</span></label>
          <input type="number" step="any" value="${item.qty}" 
                 oninput="updateItemField(${index}, 'qty', parseFloat(this.value) || 0)" required>
        </div>
        <div class="form-field item-field-wrap fixed-unit">
          <label>Unit</label>
          <input type="text" value="${escapeHtml(item.unit || 'CBM')}" 
                 placeholder="CBM" oninput="updateItemField(${index}, 'unit', this.value)">
        </div>
        <div class="form-field item-field-wrap">
          <label>Rate (₹) <span class="req">*</span></label>
          <input type="number" step="any" value="${item.rate}" 
                 oninput="updateItemField(${index}, 'rate', parseFloat(this.value) || 0)" required>
        </div>
        <div class="form-field item-field-wrap fixed-tax">
          <label>Tax %</label>
          <select onchange="updateItemField(${index}, 'taxRate', parseFloat(this.value))">
            <option value="18" ${item.taxRate === 18 ? 'selected' : ''}>18%</option>
            <option value="12" ${item.taxRate === 12 ? 'selected' : ''}>12%</option>
            <option value="5" ${item.taxRate === 5 ? 'selected' : ''}>5%</option>
            <option value="28" ${item.taxRate === 28 ? 'selected' : ''}>28%</option>
            <option value="0" ${item.taxRate === 0 ? 'selected' : ''}>0%</option>
          </select>
        </div>
        <div class="form-field item-total-field">
          <label>Amount</label>
          <div class="item-total-badge" id="itemTotal_${index}">
            ₹ ${formatINR(lineTotal)}
          </div>
        </div>
      </div>
    `;
    container.appendChild(row);
  });
}

function updateItemField(index, field, value) {
  if (invoiceItems[index]) {
    invoiceItems[index][field] = value;
    if (field === "qty" || field === "rate") {
      const badge = document.getElementById(`itemTotal_${index}`);
      if (badge) {
        const lineTotal = (invoiceItems[index].qty || 0) * (invoiceItems[index].rate || 0);
        badge.textContent = `₹ ${formatINR(lineTotal)}`;
      }
    }
    calculateTotals();
  }
}

function addItemRow() {
  invoiceItems.push({
    desc: "",
    hsn: "4407",
    qty: 1,
    unit: "CBM",
    rate: 0,
    taxRate: 18
  });
  renderItemsForm();
  calculateTotals();
}

function removeItemRow(index) {
  if (invoiceItems.length > 1) {
    invoiceItems.splice(index, 1);
    renderItemsForm();
    calculateTotals();
  }
}

// -------------------------------------------------------------
// GST DETERMINATION & TOTALS CALCULATION
// -------------------------------------------------------------
function determineTaxMode() {
  const manual = document.getElementById("manualTaxType") ? document.getElementById("manualTaxType").value : "AUTO";
  if (manual === "IGST") return "IGST";
  if (manual === "CGST_SGST") return "CGST_SGST";

  const buyerStateCode = document.getElementById("buyerStateCode").value.trim();
  const companyStateCode = (companyProfile.stateCode || "32").trim();

  // If buyer state code matches company code -> Intrastate CGST + SGST
  if (buyerStateCode && buyerStateCode === companyStateCode) {
    return "CGST_SGST";
  }
  return "IGST"; // Interstate default
}

function calculateTotals() {
  let taxableValue = 0;
  let totalQty = 0;

  invoiceItems.forEach(item => {
    const q = Number(item.qty) || 0;
    const r = Number(item.rate) || 0;
    taxableValue += (q * r);
    totalQty += q;
  });

  const taxMode = determineTaxMode();
  let totalTax = 0;

  invoiceItems.forEach(item => {
    const amt = (Number(item.qty) || 0) * (Number(item.rate) || 0);
    const rate = Number(item.taxRate) || 18;
    totalTax += (amt * (rate / 100));
  });

  const grandTotal = Math.round(taxableValue + totalTax);

  // Update UI Summary Elements
  const taxModeText = document.getElementById("taxModeText");
  if (taxModeText) {
    if (taxMode === "IGST") {
      taxModeText.innerHTML = `Interstate &rarr; <strong>IGST (Integrated Tax)</strong>`;
    } else {
      taxModeText.innerHTML = `Intrastate &rarr; <strong>CGST + SGST (Central + State Tax)</strong>`;
    }
  }

  const elTaxable = document.getElementById("calc_taxable");
  const elTaxAmount = document.getElementById("calc_total_tax_amount");
  const elTotal = document.getElementById("calc_total");
  const elWords = document.getElementById("calc_words");

  if (elTaxable) elTaxable.textContent = `₹ ${formatINR(taxableValue)}`;
  if (elTaxAmount) elTaxAmount.textContent = `₹ ${formatINR(totalTax)}`;
  if (elTotal) elTotal.textContent = `₹ ${formatINR(grandTotal)}`;
  if (elWords) elWords.textContent = numberToWordsINR(grandTotal);

  return { taxableValue, totalTax, grandTotal, totalQty, taxMode };
}

// -------------------------------------------------------------
// EXACT 1:1 TALLY A4 PRINT SHEET SYNC
// -------------------------------------------------------------
function syncFormToPrintSheet() {
  const calc = calculateTotals();

  // 1. Company Box
  document.getElementById("p_compName").textContent = companyProfile.name || "";
  document.getElementById("p_compAddress").innerHTML = escapeHtml(companyProfile.address || "").replace(/\n/g, "<br>");
  document.getElementById("p_compUdayam").textContent = companyProfile.udayam || "";
  document.getElementById("p_compGstin").textContent = companyProfile.gstin || "";
  document.getElementById("p_compState").textContent = companyProfile.state || "";
  document.getElementById("p_compStateCode").textContent = companyProfile.stateCode || "";

  // 2. Consignee Box
  const cName = document.getElementById("consigneeName").value || document.getElementById("buyerName").value;
  const cAddr = document.getElementById("consigneeAddress").value || document.getElementById("buyerAddress").value;
  const cGstin = document.getElementById("consigneeGstin").value || document.getElementById("buyerGstin").value;
  const cState = document.getElementById("consigneeState").value || document.getElementById("buyerState").value;
  const cCode = document.getElementById("consigneeStateCode").value || document.getElementById("buyerStateCode").value;

  document.getElementById("p_consigneeName").textContent = cName;
  document.getElementById("p_consigneeAddress").innerHTML = escapeHtml(cAddr).replace(/\n/g, "<br>");
  document.getElementById("p_consigneeGstin").textContent = cGstin;
  document.getElementById("p_consigneeStateLine").textContent = `${cState}, Code : ${cCode}`;

  // 3. Buyer Box
  const bName = document.getElementById("buyerName").value;
  const bAddr = document.getElementById("buyerAddress").value;
  const bGstin = document.getElementById("buyerGstin").value;
  const bState = document.getElementById("buyerState").value;
  const bCode = document.getElementById("buyerStateCode").value;

  document.getElementById("p_buyerName").textContent = bName;
  document.getElementById("p_buyerAddress").innerHTML = escapeHtml(bAddr).replace(/\n/g, "<br>");
  document.getElementById("p_buyerGstin").textContent = bGstin;
  document.getElementById("p_buyerStateLine").textContent = `${bState}, Code : ${bCode}`;

  // 4. Metadata Right Column
  document.getElementById("p_invNo").textContent = document.getElementById("invNo").value || "";
  document.getElementById("p_invDate").textContent = document.getElementById("invDate").value || "";
  document.getElementById("p_vehicleNo").textContent = (document.getElementById("vehicleNo").value || "").toUpperCase();

  document.getElementById("p_deliveryNote").textContent = document.getElementById("deliveryNote").value || " ";
  document.getElementById("p_paymentTerms").textContent = document.getElementById("paymentTerms").value || " ";
  document.getElementById("p_refNoDate").textContent = document.getElementById("refNoDate").value || " ";
  document.getElementById("p_otherRef").textContent = document.getElementById("otherRef").value || " ";
  document.getElementById("p_buyerOrderNo").textContent = document.getElementById("buyerOrderNo").value || " ";
  document.getElementById("p_buyerOrderDate").textContent = document.getElementById("buyerOrderDate").value || " ";
  document.getElementById("p_dispatchDocNo").textContent = document.getElementById("dispatchDocNo").value || " ";
  document.getElementById("p_deliveryNoteDate").textContent = document.getElementById("deliveryNoteDate").value || " ";
  document.getElementById("p_dispatchedThrough").textContent = document.getElementById("dispatchedThrough").value || " ";
  document.getElementById("p_destination").textContent = document.getElementById("destination").value || " ";
  document.getElementById("p_billOfLading").textContent = document.getElementById("billOfLading").value || " ";
  document.getElementById("p_termsOfDelivery").textContent = document.getElementById("termsOfDelivery").value || " ";

  // 5. Product Items Table (with Tally Tax Ledger Row & Grand Total)
  const tbody = document.getElementById("p_itemsBody");
  tbody.innerHTML = "";

  invoiceItems.forEach((item, idx) => {
    const tr = document.createElement("tr");
    const amt = (Number(item.qty) || 0) * (Number(item.rate) || 0);

    tr.innerHTML = `
      <td class="col-sl border-right">${idx + 1}</td>
      <td class="col-desc border-right"><strong>${escapeHtml(item.desc)}</strong></td>
      <td class="col-hsn border-right">${escapeHtml(item.hsn || "")}</td>
      <td class="col-qty border-right"><strong>${Number(item.qty).toFixed(3)} ${escapeHtml(item.unit || "CBM")}</strong></td>
      <td class="col-rate border-right">${formatINR(item.rate)}</td>
      <td class="col-per border-right">${escapeHtml(item.unit || "CBM")}</td>
      <td class="col-amt bold">${formatINR(amt)}</td>
    `;
    tbody.appendChild(tr);
  });

  // Vertical spacer row to fill page height before tax ledger line
  const spacerTr = document.createElement("tr");
  spacerTr.className = "tally-spacer-row";
  spacerTr.innerHTML = `
    <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
  `;
  tbody.appendChild(spacerTr);

  // Tally Tax Ledger Row(s) inside Items Table (IGST or CGST + SGST)
  const mainTaxRate = (invoiceItems[0] && Number(invoiceItems[0].taxRate) !== undefined) ? Number(invoiceItems[0].taxRate) : 18;
  if (calc.taxMode === "IGST") {
    const taxRow = document.createElement("tr");
    taxRow.className = "tally-tax-line-row";
    taxRow.innerHTML = `
      <td class="col-sl border-right"></td>
      <td class="col-desc border-right tax-ledger-label">IGST</td>
      <td class="col-hsn border-right"></td>
      <td class="col-qty border-right"></td>
      <td class="col-rate border-right italic-rate">${mainTaxRate}</td>
      <td class="col-per border-right">%</td>
      <td class="col-amt bold">${formatINR(calc.totalTax)}</td>
    `;
    tbody.appendChild(taxRow);
  } else {
    const halfRate = mainTaxRate / 2;
    const halfTax = calc.totalTax / 2;
    const cgstRow = document.createElement("tr");
    cgstRow.className = "tally-tax-line-row";
    cgstRow.innerHTML = `
      <td class="col-sl border-right"></td>
      <td class="col-desc border-right tax-ledger-label">CGST</td>
      <td class="col-hsn border-right"></td>
      <td class="col-qty border-right"></td>
      <td class="col-rate border-right italic-rate">${halfRate}</td>
      <td class="col-per border-right">%</td>
      <td class="col-amt bold">${formatINR(halfTax)}</td>
    `;
    tbody.appendChild(cgstRow);

    const sgstRow = document.createElement("tr");
    sgstRow.className = "tally-tax-line-row";
    sgstRow.innerHTML = `
      <td class="col-sl border-right"></td>
      <td class="col-desc border-right tax-ledger-label">SGST</td>
      <td class="col-hsn border-right"></td>
      <td class="col-qty border-right"></td>
      <td class="col-rate border-right italic-rate">${halfRate}</td>
      <td class="col-per border-right">%</td>
      <td class="col-amt bold">${formatINR(halfTax)}</td>
    `;
    tbody.appendChild(sgstRow);
  }

  // Footer Totals (Grand Total matching Tally format)
  const primaryUnit = (invoiceItems[0] && invoiceItems[0].unit) || "CBM";
  document.getElementById("p_totalQty").textContent = `${calc.totalQty.toFixed(3)} ${primaryUnit}`;
  document.getElementById("p_totalAmount").textContent = `₹ ${formatINR(calc.grandTotal)}`;

  // Words
  document.getElementById("p_amountInWords").textContent = numberToWordsINR(calc.grandTotal);
  document.getElementById("p_taxAmountInWords").textContent = numberToWordsINR(calc.totalTax);

  // 6. Tax Breakdown Table (47% first column aligned with vertical spine)
  const taxWrap = document.getElementById("p_taxBreakdownWrapper");
  if (calc.taxMode === "IGST") {
    let taxRows = "";
    invoiceItems.forEach(item => {
      const amt = (Number(item.qty) || 0) * (Number(item.rate) || 0);
      const rate = Number(item.taxRate) || 18;
      const taxVal = amt * (rate / 100);
      taxRows += `
        <tr>
          <td>${escapeHtml(item.hsn || "")}</td>
          <td class="text-right">${formatINR(amt)}</td>
          <td class="text-right">${rate}%</td>
          <td class="text-right">${formatINR(taxVal)}</td>
          <td class="text-right">${formatINR(taxVal)}</td>
        </tr>
      `;
    });

    taxWrap.innerHTML = `
      <table class="tally-tax-table">
        <colgroup>
          <col style="width: 47%;">
          <col style="width: 15%;">
          <col style="width: 10%;">
          <col style="width: 14%;">
          <col style="width: 14%;">
        </colgroup>
        <thead>
          <tr>
            <th rowspan="2">HSN/SAC</th>
            <th rowspan="2">Taxable<br>Value</th>
            <th colspan="2">IGST</th>
            <th rowspan="2">Total<br>Tax Amount</th>
          </tr>
          <tr>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${taxRows}
          <tr class="bold">
            <td class="text-right">Total</td>
            <td class="text-right">${formatINR(calc.taxableValue)}</td>
            <td></td>
            <td class="text-right">${formatINR(calc.totalTax)}</td>
            <td class="text-right">${formatINR(calc.totalTax)}</td>
          </tr>
        </tbody>
      </table>
    `;
  } else {
    // CGST + SGST Intrastate Breakdown
    let taxRows = "";
    invoiceItems.forEach(item => {
      const amt = (Number(item.qty) || 0) * (Number(item.rate) || 0);
      const halfRate = (Number(item.taxRate) || 18) / 2;
      const halfTax = amt * (halfRate / 100);
      const totTax = halfTax * 2;
      taxRows += `
        <tr>
          <td>${escapeHtml(item.hsn || "")}</td>
          <td class="text-right">${formatINR(amt)}</td>
          <td class="text-right">${halfRate}%</td>
          <td class="text-right">${formatINR(halfTax)}</td>
          <td class="text-right">${halfRate}%</td>
          <td class="text-right">${formatINR(halfTax)}</td>
          <td class="text-right">${formatINR(totTax)}</td>
        </tr>
      `;
    });

    taxWrap.innerHTML = `
      <table class="tally-tax-table">
        <colgroup>
          <col style="width: 47%;">
          <col style="width: 13%;">
          <col style="width: 6%;">
          <col style="width: 10%;">
          <col style="width: 6%;">
          <col style="width: 10%;">
          <col style="width: 8%;">
        </colgroup>
        <thead>
          <tr>
            <th rowspan="2">HSN/SAC</th>
            <th rowspan="2">Taxable<br>Value</th>
            <th colspan="2">Central Tax</th>
            <th colspan="2">State Tax</th>
            <th rowspan="2">Total<br>Tax Amount</th>
          </tr>
          <tr>
            <th>Rate</th>
            <th>Amount</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${taxRows}
          <tr class="bold">
            <td class="text-right">Total</td>
            <td class="text-right">${formatINR(calc.taxableValue)}</td>
            <td></td>
            <td class="text-right">${formatINR(calc.totalTax / 2)}</td>
            <td></td>
            <td class="text-right">${formatINR(calc.totalTax / 2)}</td>
            <td class="text-right">${formatINR(calc.totalTax)}</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  // 7. Footer Seal & Signature
  document.getElementById("p_signCompName").textContent = companyProfile.name || "";

  const sealWrap = document.getElementById("p_sealImageWrap");
  if (companyProfile.sealImg) {
    sealWrap.innerHTML = `<img src="${companyProfile.sealImg}" alt="Seal">`;
  } else {
    sealWrap.innerHTML = "";
  }

  const signWrap = document.getElementById("p_signImageWrap");
  if (companyProfile.signImg) {
    signWrap.innerHTML = `<img src="${companyProfile.signImg}" alt="Signature">`;
  } else {
    signWrap.innerHTML = "";
  }
}

// -------------------------------------------------------------
// DIRECT NATIVE PRINT / PDF TRIGGER (Phone & Desktop Print Sheet)
// -------------------------------------------------------------
function triggerDirectPrint() {
  const buyerName = document.getElementById("buyerName").value.trim();
  if (!buyerName) {
    alert("Please enter the Buyer Name before printing.");
    document.getElementById("buyerName").focus();
    return;
  }

  syncFormToPrintSheet();
  window.print();
}

function openPrintPreview() {
  triggerDirectPrint();
}

window.addEventListener("beforeprint", function() {
  syncFormToPrintSheet();
});

// -------------------------------------------------------------
// INVOICE STORAGE & HISTORY
// -------------------------------------------------------------
function saveCurrentInvoice() {
  const invNo = document.getElementById("invNo").value.trim();
  if (!invNo) {
    alert("Please enter an Invoice Number.");
    return;
  }

  const calc = calculateTotals();

  const invoiceRecord = {
    invNo: invNo,
    invDate: document.getElementById("invDate").value,
    invDatePicker: document.getElementById("invDatePicker").value,
    vehicleNo: document.getElementById("vehicleNo").value,

    // More options
    deliveryNote: document.getElementById("deliveryNote").value,
    paymentTerms: document.getElementById("paymentTerms").value,
    refNoDate: document.getElementById("refNoDate").value,
    otherRef: document.getElementById("otherRef").value,
    buyerOrderNo: document.getElementById("buyerOrderNo").value,
    buyerOrderDate: document.getElementById("buyerOrderDate").value,
    buyerOrderDatePicker: document.getElementById("buyerOrderDatePicker").value,
    dispatchDocNo: document.getElementById("dispatchDocNo").value,
    deliveryNoteDate: document.getElementById("deliveryNoteDate").value,
    deliveryNoteDatePicker: document.getElementById("deliveryNoteDatePicker").value,
    dispatchedThrough: document.getElementById("dispatchedThrough").value,
    destination: document.getElementById("destination").value,
    billOfLading: document.getElementById("billOfLading").value,
    termsOfDelivery: document.getElementById("termsOfDelivery").value,

    // Parties
    consignee: {
      name: document.getElementById("consigneeName").value,
      address: document.getElementById("consigneeAddress").value,
      gstin: document.getElementById("consigneeGstin").value,
      state: document.getElementById("consigneeState").value,
      stateCode: document.getElementById("consigneeStateCode").value
    },
    buyer: {
      name: document.getElementById("buyerName").value,
      address: document.getElementById("buyerAddress").value,
      gstin: document.getElementById("buyerGstin").value,
      state: document.getElementById("buyerState").value,
      stateCode: document.getElementById("buyerStateCode").value
    },

    items: JSON.parse(JSON.stringify(invoiceItems)),
    totals: calc,
    savedAt: new Date().toISOString()
  };

  const existingIdx = savedInvoices.findIndex(i => i.invNo === invNo);
  if (existingIdx >= 0) {
    savedInvoices[existingIdx] = invoiceRecord;
  } else {
    savedInvoices.unshift(invoiceRecord);
  }

  safeSetLocal("sism_invoices", savedInvoices);
  pushInvoiceToSupabase(invoiceRecord);
  alert(`Invoice ${invNo} saved successfully!`);
}

function loadInvoiceIntoForm(inv) {
  document.getElementById("invNo").value = inv.invNo || "";
  document.getElementById("invDate").value = inv.invDate || "";
  document.getElementById("invDatePicker").value = inv.invDatePicker || "";
  document.getElementById("vehicleNo").value = inv.vehicleNo || "";

  document.getElementById("deliveryNote").value = inv.deliveryNote || "";
  document.getElementById("paymentTerms").value = inv.paymentTerms || "";
  document.getElementById("refNoDate").value = inv.refNoDate || "";
  document.getElementById("otherRef").value = inv.otherRef || "";
  document.getElementById("buyerOrderNo").value = inv.buyerOrderNo || "";
  document.getElementById("buyerOrderDate").value = inv.buyerOrderDate || "";
  document.getElementById("buyerOrderDatePicker").value = inv.buyerOrderDatePicker || "";
  document.getElementById("dispatchDocNo").value = inv.dispatchDocNo || "";
  document.getElementById("deliveryNoteDate").value = inv.deliveryNoteDate || "";
  document.getElementById("deliveryNoteDatePicker").value = inv.deliveryNoteDatePicker || "";
  document.getElementById("dispatchedThrough").value = inv.dispatchedThrough || "";
  document.getElementById("destination").value = inv.destination || "";
  document.getElementById("billOfLading").value = inv.billOfLading || "";
  document.getElementById("termsOfDelivery").value = inv.termsOfDelivery || "";

  if (inv.consignee) {
    document.getElementById("consigneeName").value = inv.consignee.name || "";
    document.getElementById("consigneeAddress").value = inv.consignee.address || "";
    document.getElementById("consigneeGstin").value = inv.consignee.gstin || "";
    document.getElementById("consigneeState").value = inv.consignee.state || "";
    document.getElementById("consigneeStateCode").value = inv.consignee.stateCode || "";
  }

  if (inv.buyer) {
    document.getElementById("buyerName").value = inv.buyer.name || "";
    document.getElementById("buyerAddress").value = inv.buyer.address || "";
    document.getElementById("buyerGstin").value = inv.buyer.gstin || "";
    document.getElementById("buyerState").value = inv.buyer.state || "";
    document.getElementById("buyerStateCode").value = inv.buyer.stateCode || "";
  }

  if (inv.items && inv.items.length) {
    invoiceItems = JSON.parse(JSON.stringify(inv.items));
  }

  renderItemsForm();
  calculateTotals();
  navigateTo("billing");
}

function reprintInvoice(invNo) {
  const inv = savedInvoices.find(i => i.invNo === invNo);
  if (inv) {
    loadInvoiceIntoForm(inv);
    openPrintPreview();
  }
}

function deleteInvoice(invNo) {
  if (confirm(`Delete invoice ${invNo}?`)) {
    savedInvoices = savedInvoices.filter(i => i.invNo !== invNo);
    safeSetLocal("sism_invoices", savedInvoices);
    deleteInvoiceFromSupabase(invNo);
    renderHistoryTable();
    renderHomeRecent();
  }
}

function renderHistoryTable() {
  const container = document.getElementById("historyListContainer");
  if (!container) return;

  const search = (document.getElementById("historySearchInput") ? document.getElementById("historySearchInput").value : "").toLowerCase();
  const list = savedInvoices.filter(i => {
    return (i.invNo && i.invNo.toLowerCase().includes(search)) ||
           (i.buyer && i.buyer.name && i.buyer.name.toLowerCase().includes(search)) ||
           (i.vehicleNo && i.vehicleNo.toLowerCase().includes(search));
  });

  if (list.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; padding: 30px; text-align: center; color: #94a3b8;">No saved invoices found.</div>`;
    return;
  }

  container.innerHTML = "";
  list.forEach(inv => {
    const card = document.createElement("div");
    card.className = "history-card-item";
    card.innerHTML = `
      <div class="history-card-head">
        <div>
          <div class="history-card-inv">${escapeHtml(inv.invNo)}</div>
          <div class="history-card-date">${escapeHtml(inv.invDate)} &bull; ${escapeHtml(inv.vehicleNo || "")}</div>
        </div>
        <div class="history-card-amt">₹ ${formatINR(inv.totals ? inv.totals.grandTotal : 0)}</div>
      </div>
      <div style="font-size:0.85rem; font-weight:600; color:#334155;">${escapeHtml(inv.buyer ? inv.buyer.name : "")}</div>
      <div class="card-actions-row">
        <button class="btn btn-sm btn-primary" onclick="reprintInvoice('${escapeHtml(inv.invNo)}')">Reprint</button>
        <button class="btn btn-sm btn-secondary" onclick='loadInvoiceIntoForm(${JSON.stringify(inv)})'>Edit</button>
        <button class="btn btn-sm" style="color:#dc2626;" onclick="deleteInvoice('${escapeHtml(inv.invNo)}')">Delete</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderHomeRecent() {
  const container = document.getElementById("homeRecentInvoicesList");
  if (!container) return;

  if (savedInvoices.length === 0) {
    container.innerHTML = `<div style="padding:16px; color:#94a3b8; font-size:0.85rem; text-align:center;">No recent invoices yet. Click <strong>Sales Bill Entry</strong> above to start!</div>`;
    return;
  }

  const recent = savedInvoices.slice(0, 3);
  let html = `<div style="display:flex; flex-direction:column; gap:8px;">`;
  recent.forEach(inv => {
    html += `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0;">
        <div>
          <div style="font-weight:700; font-size:0.88rem;">${escapeHtml(inv.invNo)} &bull; <span style="font-weight:500; color:#64748b;">${escapeHtml(inv.buyer ? inv.buyer.name : "")}</span></div>
          <div style="font-size:0.75rem; color:#94a3b8;">${escapeHtml(inv.invDate)} &bull; ${escapeHtml(inv.vehicleNo || "")}</div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-weight:700; color:#1e3a8a; font-size:0.9rem;">₹ ${formatINR(inv.totals ? inv.totals.grandTotal : 0)}</span>
          <button class="btn btn-sm btn-primary" onclick="reprintInvoice('${escapeHtml(inv.invNo)}')">Print</button>
        </div>
      </div>
    `;
  });
  html += `</div>`;
  container.innerHTML = html;
}

function resetFormForNewInvoice() {
  if (confirm("Reset current bill for a new invoice?")) {
    startNewInvoice();
  }
}

function startNewInvoice() {
  const nextNo = getNextInvoiceNumber();
  document.getElementById("invNo").value = nextNo;

  const todayIso = getTodayIsoDate();
  document.getElementById("invDatePicker").value = todayIso;
  document.getElementById("invDate").value = formatTallyDate(todayIso);

  document.getElementById("vehicleNo").value = "";
  document.getElementById("deliveryNote").value = "";
  document.getElementById("paymentTerms").value = "";
  document.getElementById("refNoDate").value = "";
  document.getElementById("otherRef").value = "";
  document.getElementById("buyerOrderNo").value = "";
  document.getElementById("buyerOrderDate").value = "";
  document.getElementById("buyerOrderDatePicker").value = "";
  document.getElementById("dispatchDocNo").value = "";
  document.getElementById("deliveryNoteDate").value = "";
  document.getElementById("deliveryNoteDatePicker").value = "";
  document.getElementById("dispatchedThrough").value = "";
  document.getElementById("destination").value = "";
  document.getElementById("billOfLading").value = "";
  document.getElementById("termsOfDelivery").value = "";

  document.getElementById("consigneeName").value = "";
  document.getElementById("consigneeAddress").value = "";
  document.getElementById("consigneeGstin").value = "";
  document.getElementById("consigneeState").value = "";
  document.getElementById("consigneeStateCode").value = "";

  document.getElementById("buyerName").value = "";
  document.getElementById("buyerAddress").value = "";
  document.getElementById("buyerGstin").value = "";
  document.getElementById("buyerState").value = "";
  document.getElementById("buyerStateCode").value = "";

  invoiceItems = [
    {
      desc: "Mahagany Reeper and Battons",
      hsn: "4407",
      qty: 1,
      unit: "CBM",
      rate: 7000.00,
      taxRate: 18
    }
  ];

  renderItemsForm();
  calculateTotals();
  navigateTo("billing");
}

function getNextInvoiceNumber() {
  if (!savedInvoices.length) return "SISM/26-27/49";
  const last = savedInvoices[0].invNo;
  const match = last.match(/(\d+)$/);
  if (match) {
    const num = parseInt(match[1], 10) + 1;
    return last.substring(0, match.index) + num;
  }
  return "SISM/26-27/50";
}

// -------------------------------------------------------------
// PARTY MASTER (CUSTOMER LEDGERS)
// -------------------------------------------------------------
function renderPartiesTable() {
  const container = document.getElementById("partyListContainer");
  if (!container) return;
  container.innerHTML = "";

  partiesList.forEach(party => {
    const card = document.createElement("div");
    card.className = "party-card-item";
    card.innerHTML = `
      <div class="party-card-head">
        <div class="party-card-title">${escapeHtml(party.name)}</div>
        <span style="font-size:0.75rem; background:#eff6ff; color:#1e40af; padding:2px 8px; border-radius:4px; font-weight:700;">Code ${escapeHtml(party.stateCode)}</span>
      </div>
      <div class="party-card-gstin">GSTIN: ${escapeHtml(party.gstin || "Unregistered")}</div>
      <div class="party-card-addr">${escapeHtml(party.address || "")}</div>
      <div class="card-actions-row">
        <button class="btn btn-sm btn-secondary" onclick="openEditPartyModal('${party.id}')">Edit</button>
        <button class="btn btn-sm" style="color:#dc2626;" onclick="deleteParty('${party.id}')">Delete</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function openAddPartyModal() {
  document.getElementById("partyModalTitle").textContent = "Add New Party";
  document.getElementById("pm_id").value = "";
  document.getElementById("pm_name").value = "";
  document.getElementById("pm_address").value = "";
  document.getElementById("pm_gstin").value = "";
  document.getElementById("pm_state").value = "";
  document.getElementById("pm_stateCode").value = "";
  document.getElementById("partyModal").classList.remove("hidden");
}

function openEditPartyModal(id) {
  const party = partiesList.find(p => p.id === id);
  if (!party) return;
  document.getElementById("partyModalTitle").textContent = "Edit Party";
  document.getElementById("pm_id").value = party.id;
  document.getElementById("pm_name").value = party.name;
  document.getElementById("pm_address").value = party.address;
  document.getElementById("pm_gstin").value = party.gstin;
  document.getElementById("pm_state").value = party.state;
  document.getElementById("pm_stateCode").value = party.stateCode;
  document.getElementById("partyModal").classList.remove("hidden");
}

function closePartyModal() {
  document.getElementById("partyModal").classList.add("hidden");
}

function savePartyModal(e) {
  e.preventDefault();
  const id = document.getElementById("pm_id").value;
  const name = document.getElementById("pm_name").value.trim();
  const address = document.getElementById("pm_address").value.trim();
  const gstin = document.getElementById("pm_gstin").value.trim().toUpperCase();
  const state = document.getElementById("pm_state").value.trim();
  const stateCode = document.getElementById("pm_stateCode").value.trim();

  if (!name) {
    alert("Please enter party name.");
    return;
  }

  let savedParty = null;
  if (id) {
    const idx = partiesList.findIndex(p => p.id === id);
    if (idx >= 0) {
      savedParty = { id, name, address, gstin, state, stateCode };
      partiesList[idx] = savedParty;
    }
  } else {
    savedParty = {
      id: "p_" + Date.now(),
      name, address, gstin, state, stateCode
    };
    partiesList.push(savedParty);
  }

  safeSetLocal("sism_parties", partiesList);
  if (savedParty) {
    pushPartyToSupabase(savedParty);
  }
  populatePartiesDatalist();
  closePartyModal();
  renderPartiesTable();
}

function deleteParty(id) {
  if (confirm("Delete this party?")) {
    partiesList = partiesList.filter(p => p.id !== id);
    safeSetLocal("sism_parties", partiesList);
    deletePartyFromSupabase(id);
    populatePartiesDatalist();
    renderPartiesTable();
  }
}

// -------------------------------------------------------------
// LOGIN AUTHENTICATION & SECURITY CREDENTIALS
// -------------------------------------------------------------
function checkLoginState() {
  const overlay = document.getElementById("loginOverlay");
  if (!overlay) return;
  const isLoggedIn = safeGetSessionLogin();
  if (isLoggedIn) {
    overlay.classList.add("hidden");
  } else {
    overlay.classList.remove("hidden");
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const userEl = document.getElementById("loginUsername");
  const passEl = document.getElementById("loginPassword");
  const errBox = document.getElementById("loginErrorMsg");

  const enteredUser = (userEl.value || "").trim();
  const enteredPass = (passEl.value || "").trim();

  let savedUser = (authCredentials.username || "admin").trim();
  let savedPass = (authCredentials.password || "admin123").trim();

  // If credentials don't match local cache, do a quick fresh check from Supabase
  if (enteredUser.toLowerCase() !== savedUser.toLowerCase() || enteredPass !== savedPass) {
    await syncFromSupabase();
    savedUser = (authCredentials.username || "admin").trim();
    savedPass = (authCredentials.password || "admin123").trim();
  }

  if (enteredUser.toLowerCase() === savedUser.toLowerCase() && enteredPass === savedPass) {
    safeSetSessionLogin(true);
    if (errBox) errBox.classList.add("hidden");
    passEl.value = "";
    document.getElementById("loginOverlay").classList.add("hidden");
    syncCompanyBranding();
    syncFromSupabase();
  } else {
    if (errBox) {
      errBox.textContent = "Invalid username or password. Please try again.";
      errBox.classList.remove("hidden");
    }
  }
}

function logoutApp() {
  safeSetSessionLogin(false);
  const drawer = document.getElementById("navDrawer");
  const backdrop = document.getElementById("navDrawerBackdrop");
  if (drawer) drawer.classList.add("hidden");
  if (backdrop) backdrop.classList.add("hidden");
  const overlay = document.getElementById("loginOverlay");
  if (overlay) overlay.classList.remove("hidden");
  const userEl = document.getElementById("loginUsername");
  const passEl = document.getElementById("loginPassword");
  const errBox = document.getElementById("loginErrorMsg");
  if (userEl) userEl.value = "";
  if (passEl) passEl.value = "";
  if (errBox) errBox.classList.add("hidden");
}

function togglePasswordField(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === "password") {
    input.type = "text";
    if (btnEl) btnEl.textContent = "Hide";
  } else {
    input.type = "password";
    if (btnEl) btnEl.textContent = "Show";
  }
}

function syncCompanyBranding() {
  const hasComp = companyProfile.name && companyProfile.name.trim() !== "";
  const displayTitle = hasComp ? companyProfile.name.trim() : "GST Billing Portal";
  const headerTitle = document.getElementById("headerCompName");
  const drawerTitle = document.getElementById("drawerCompName");
  const heroTitle = document.getElementById("heroCompName");
  if (headerTitle) headerTitle.textContent = displayTitle;
  if (drawerTitle) drawerTitle.textContent = displayTitle;
  if (heroTitle) heroTitle.textContent = displayTitle;
}

function onCompanyNameLiveInput(val) {
  companyProfile.name = (val || "").trim();
  syncCompanyBranding();
  safeSetLocal("billing_company_v2", companyProfile);
  if (liveCompanySyncTimer) clearTimeout(liveCompanySyncTimer);
  liveCompanySyncTimer = setTimeout(() => {
    pushSettingsToSupabase();
  }, 700);
}

// -------------------------------------------------------------
// SETTINGS 3-BOX MENU & SUB-PANELS (Company Profile / Password / Backup)
// -------------------------------------------------------------
function showSettingsMenu() {
  const mainMenu = document.getElementById("settings-main-menu");
  const pCompany = document.getElementById("settings-panel-company");
  const pSecurity = document.getElementById("settings-panel-security");
  const pBackup = document.getElementById("settings-panel-backup");

  if (mainMenu) mainMenu.classList.remove("hidden");
  if (pCompany) pCompany.classList.add("hidden");
  if (pSecurity) pSecurity.classList.add("hidden");
  if (pBackup) pBackup.classList.add("hidden");
}

function openSettingsPanel(panelName) {
  const mainMenu = document.getElementById("settings-main-menu");
  const pCompany = document.getElementById("settings-panel-company");
  const pSecurity = document.getElementById("settings-panel-security");
  const pBackup = document.getElementById("settings-panel-backup");

  if (mainMenu) mainMenu.classList.add("hidden");
  if (pCompany) pCompany.classList.add("hidden");
  if (pSecurity) pSecurity.classList.add("hidden");
  if (pBackup) pBackup.classList.add("hidden");

  if (panelName === "company" && pCompany) {
    loadSettingsForm();
    pCompany.classList.remove("hidden");
  } else if (panelName === "security" && pSecurity) {
    loadSettingsForm();
    pSecurity.classList.remove("hidden");
  } else if (panelName === "backup" && pBackup) {
    renderBackupSummary();
    pBackup.classList.remove("hidden");
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// -------------------------------------------------------------
// COMPANY SETTINGS & SEPARATE SEAL & SIGNATURE UPLOADS
// -------------------------------------------------------------
function loadSettingsForm() {
  document.getElementById("set_compName").value = companyProfile.name || "";
  document.getElementById("set_compAddress").value = companyProfile.address || "";
  document.getElementById("set_compUdayam").value = companyProfile.udayam || "";
  document.getElementById("set_compGstin").value = companyProfile.gstin || "";
  document.getElementById("set_compState").value = companyProfile.state || "";
  document.getElementById("set_compStateCode").value = companyProfile.stateCode || "";

  const setLoginUser = document.getElementById("set_loginUsername");
  const setLoginPass = document.getElementById("set_loginPassword");
  if (setLoginUser) setLoginUser.value = authCredentials.username || "admin";
  if (setLoginPass) setLoginPass.value = authCredentials.password || "admin123";

  renderSealThumbnail();
  renderSignThumbnail();
}

function saveLoginCredentials(e) {
  e.preventDefault();
  const newUsername = document.getElementById("set_loginUsername").value.trim();
  const newPassword = document.getElementById("set_loginPassword").value.trim();

  if (!newUsername || !newPassword) {
    alert("Please enter both a Username and Password.");
    return;
  }

  authCredentials.username = newUsername;
  authCredentials.password = newPassword;
  safeSetLocal("sism_auth", authCredentials);
  pushSettingsToSupabase();
  alert("Login Username & Password updated successfully!");
  showSettingsMenu();
}

function renderSealThumbnail() {
  const box = document.getElementById("sealPreviewContainer");
  if (!box) return;
  if (companyProfile.sealImg) {
    box.innerHTML = `
      <img src="${companyProfile.sealImg}" alt="Seal Preview">
      <button type="button" class="btn btn-sm" style="color:#dc2626;" onclick="removeSealImage()">Remove Seal</button>
    `;
  } else {
    box.innerHTML = `<span style="font-size:0.75rem; color:#94a3b8;">No seal uploaded.</span>`;
  }
}

function renderSignThumbnail() {
  const box = document.getElementById("signPreviewContainer");
  if (!box) return;
  if (companyProfile.signImg) {
    box.innerHTML = `
      <img src="${companyProfile.signImg}" alt="Signature Preview">
      <button type="button" class="btn btn-sm" style="color:#dc2626;" onclick="removeSignImage()">Remove Signature</button>
    `;
  } else {
    box.innerHTML = `<span style="font-size:0.75rem; color:#94a3b8;">No signature uploaded.</span>`;
  }
}

function handleSealUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    companyProfile.sealImg = evt.target.result;
    safeSetLocal("billing_company_v2", companyProfile);
    pushSettingsToSupabase();
    renderSealThumbnail();
  };
  reader.readAsDataURL(file);
}

function handleSignUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    companyProfile.signImg = evt.target.result;
    safeSetLocal("billing_company_v2", companyProfile);
    pushSettingsToSupabase();
    renderSignThumbnail();
  };
  reader.readAsDataURL(file);
}

function removeSealImage() {
  companyProfile.sealImg = "";
  safeSetLocal("billing_company_v2", companyProfile);
  pushSettingsToSupabase();
  renderSealThumbnail();
}

function removeSignImage() {
  companyProfile.signImg = "";
  safeSetLocal("billing_company_v2", companyProfile);
  pushSettingsToSupabase();
  renderSignThumbnail();
}

function saveCompanySettings(e) {
  e.preventDefault();
  companyProfile.name = document.getElementById("set_compName").value.trim();
  companyProfile.address = document.getElementById("set_compAddress").value.trim();
  companyProfile.udayam = document.getElementById("set_compUdayam").value.trim();
  companyProfile.gstin = document.getElementById("set_compGstin").value.trim().toUpperCase();
  companyProfile.state = document.getElementById("set_compState").value.trim();
  companyProfile.stateCode = document.getElementById("set_compStateCode").value.trim();

  syncCompanyBranding();
  safeSetLocal("billing_company_v2", companyProfile);
  pushSettingsToSupabase();
  alert("Company profile saved successfully!");
  showSettingsMenu();
}

// -------------------------------------------------------------
// BACKUP & RESTORE DATA (Full JSON Export & Import)
// -------------------------------------------------------------
function renderBackupSummary() {
  const compEl = document.getElementById("backup_compStatus");
  const partiesEl = document.getElementById("backup_partiesCount");
  const invEl = document.getElementById("backup_invoicesCount");

  if (compEl) {
    compEl.textContent = (companyProfile && companyProfile.name) ? companyProfile.name : "Not Set Yet";
  }
  if (partiesEl) {
    partiesEl.textContent = `${partiesList.length} Parties`;
  }
  if (invEl) {
    invEl.textContent = `${savedInvoices.length} Invoices`;
  }
}

function downloadFullBackup() {
  const backupData = {
    app: "GST_Billing_Portal",
    version: "2.0",
    exportedAt: new Date().toISOString(),
    companyProfile: companyProfile,
    partiesList: partiesList,
    savedInvoices: savedInvoices,
    authCredentials: authCredentials
  };

  const jsonStr = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  const dateStr = getTodayIsoDate();
  link.href = url;
  link.download = `billing_backup_${dateStr}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function restoreFromBackupFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = JSON.parse(evt.target.result);
      if (!data || (typeof data !== "object")) {
        alert("Invalid backup file format.");
        return;
      }

      if (data.companyProfile) {
        companyProfile = data.companyProfile;
        safeSetLocal("billing_company_v2", companyProfile);
      }
      if (Array.isArray(data.partiesList)) {
        partiesList = data.partiesList;
        safeSetLocal("sism_parties", partiesList);
      }
      if (Array.isArray(data.savedInvoices)) {
        savedInvoices = data.savedInvoices;
        safeSetLocal("sism_invoices", savedInvoices);
      }
      if (data.authCredentials && data.authCredentials.username && data.authCredentials.password) {
        authCredentials = data.authCredentials;
        safeSetLocal("sism_auth", authCredentials);
      }

      // Sync restored backup data to Supabase Cloud
      pushSettingsToSupabase();
      pushAllPartiesToSupabase();
      pushAllInvoicesToSupabase();

      syncCompanyBranding();
      loadSettingsForm();
      populatePartiesDatalist();
      renderPartiesTable();
      renderHistoryTable();
      renderHomeRecent();
      renderBackupSummary();

      alert("Backup restored successfully! All company details, parties, and invoices have been loaded and synced to cloud.");
      e.target.value = "";
    } catch (err) {
      alert("Failed to read backup file. Please select a valid .json backup file.");
    }
  };
  reader.readAsText(file);
}

// -------------------------------------------------------------
// INITIALIZATION ON PAGE LOAD
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", function() {
  checkLoginState();
  syncCompanyBranding();

  // Set default initial date if picker empty
  const datePicker = document.getElementById("invDatePicker");
  if (datePicker && !datePicker.value) {
    const today = getTodayIsoDate();
    datePicker.value = today;
    document.getElementById("invDate").value = formatTallyDate(today);
  }

  populatePartiesDatalist();
  renderItemsForm();
  calculateTotals();
  renderHomeRecent();

  // Sync latest data from Supabase Cloud Database
  syncFromSupabase();
});
