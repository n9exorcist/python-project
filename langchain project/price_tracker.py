r"""
Diaper Price Tracker
====================
Checks Pampers Complete Skin Comfort XL prices across Amazon.in, Flipkart,
BigBasket and Blinkit, compares against the last run, and reports to you
on Telegram (or the console if Telegram isn't configured yet).

------------------------------------------------------------------
SETUP (one time, in PowerShell)
------------------------------------------------------------------
1. Install dependencies:
       pip install playwright requests
       playwright install chromium

2. Paste your Amazon product URL:
       In PRODUCTS below, replace PASTE_YOUR_AMAZON_URL_HERE with the
       exact URL of the 112-count mega box you found at Rs 2,039.
       (Entries left as placeholders are skipped automatically.)

3. Create a Telegram bot (5 minutes):
       a. In Telegram, message @BotFather -> /newbot -> follow prompts.
          Copy the token it gives you (looks like 123456:ABC-xyz...).
       b. Send any message ("hi") to your new bot.
       c. Open in a browser:
          https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
          and copy the "chat":{"id": ... } number.
       d. Paste both into TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID below.
       Until you do this, reports just print to the console.

4. One-time session setup (fixes Amazon captcha + pincode-gated sites):
       python price_tracker.py --setup
       A real browser window opens with Amazon, FirstCry, JioMart and
       Blinkit tabs. Set delivery pincode 600091 on the shopping sites,
       clear any Amazon captcha (logging in to Amazon helps), then come
       back to the terminal and press Enter. The session is saved in the
       browser_profile folder and reused by every scheduled run. Redo
       this whenever Amazon starts captcha-ing again.

5. Test it:
       python price_tracker.py

6. Schedule daily at 8 AM (adjust the two paths):
       schtasks /Create /F /SC DAILY /ST 08:00 /TN "DiaperPriceTracker" ^
         /TR "\"C:\Path\to\python.exe\" \"C:\Path\to\price_tracker.py\""

------------------------------------------------------------------
KNOWN LIMITATIONS (read once)
------------------------------------------------------------------
- BigBasket/Blinkit prices on the public web pages reflect a default
  metro store, not necessarily pincode 600091. Treat them as a trend
  signal and confirm in the app before ordering.
- Amazon/Flipkart change their HTML and run bot detection. When a site
  blocks or redesigns, that line shows a warning in the report instead
  of a price - expect to patch a selector every few weeks.
- price_history.json holds the last seen prices; price_log.csv keeps
  the full history (handy for charting later).
- ADDING A NEW SITE: add an entry in PRODUCTS with "site": "generic"
  and the product URL. The generic scraper tries JSON-LD, the page
  title, price meta tags, then falls back to the lowest rupee figure
  on the page within that entry's min_price/max_price range. Entries
  whose URL still says PASTE_ are skipped until you fill them in.
"""

import csv
import json
import os
import re
import sys
import traceback
from datetime import datetime
from pathlib import Path

import requests

# ----------------------------------------------------------------------
# CONFIG - edit this section
# ----------------------------------------------------------------------

PRODUCTS = [
    {
        "name": "Amazon - 112 ct mega box",
        "url": "https://www.amazon.in/dp/B07CXGS2VZ",
        "count": 112,
        "site": "amazon",
    },
    {
        "name": "Amazon - 56 ct",
        "url": "https://www.amazon.in/Pampers-Complete-Comfort-Anti-rash-blanket/dp/B07CXGJKXL",
        "count": 56,
        "site": "amazon",
    },
    {
        "name": "Flipkart - 112 ct",
        "url": "https://www.flipkart.com/pampers-complete-skin-comfort-pants-anti-rash-blanket-lotion-vitamine-aloe-vera-xl/p/itmbb8c58754856e",
        "count": 112,
        "site": "flipkart",
    },
    {
        "name": "BigBasket - 56 ct",
        "url": "https://www.bigbasket.com/pd/40129677/pampers-diaper-pants-extra-large-56-pcs/",
        "count": 56,
        "site": "bigbasket",
        "min_price": 700,
        "max_price": 1400,
        "wait_ms": 6000,
    },
    {
        "name": "BigBasket - 112 ct",
        "url": "https://www.bigbasket.com/pd/40129678/pampers-diaper-pants-extra-large-112-pcs/",
        "count": 112,
        "site": "bigbasket",
        "min_price": 1500,
        "max_price": 4000,
        "wait_ms": 6000,
    },
    {
        "name": "Blinkit - XL (56 ct shown)",
        "url": "https://blinkit.com/prn/pampers-complete-skin-comfort-pant-style-baby-diaper-xl/prid/391084",
        "count": 56,
        "site": "blinkit",
        "wait_ms": 5000,
    },
    {
        "name": "FirstCry - 112 ct",
        "url": "https://www.firstcry.com/pampers/pampers-complete-skin-comfort-pants-anti-rash-blanket-lotion-with-vitamin-e-and-aloe-vera-extra-large-size-baby-diapers-xl-112-count-12-17-kg/2103268/product-detail",
        "count": 112,
        "site": "generic",
        "min_price": 1500,
        "max_price": 4000,
        "wait_ms": 9000,  # FirstCry renders the price late
    },
    {
        "name": "JioMart - 112 ct",
        # Same product under its older "All-round Protection" name
        "url": "https://www.jiomart.com/p/groceries/pampers-all-round-protection-pants-extra-large-size-baby-diapers-xl-112-count-12-17-kg-lotion-with-aloe-vera/601170476",
        "count": 112,
        "site": "generic",
        "min_price": 1500,
        "max_price": 4000,
        "wait_ms": 7000,
    },
    # --- Paste the exact product URL to activate any of these ---
    {
        "name": "Zepto - XL",
        "url": "PASTE_ZEPTO_URL_HERE",  # find the XL listing in the app/site
        "count": 112,
        "site": "generic",
        "min_price": 1500,
        "max_price": 4000,
    },
    {
        "name": "Tata 1mg - 112 ct",
        "url": "PASTE_1MG_URL_HERE",
        "count": 112,
        "site": "generic",
        "min_price": 1500,
        "max_price": 4000,
    },
    {
        "name": "Apollo Pharmacy - 112 ct",
        "url": "PASTE_APOLLO_URL_HERE",
        "count": 112,
        "site": "generic",
        "min_price": 1500,
        "max_price": 4000,
    },
    {
        "name": "PharmEasy - 112 ct",
        "url": "PASTE_PHARMEASY_URL_HERE",
        "count": 112,
        "site": "generic",
        "min_price": 1500,
        "max_price": 4000,
    },
    {
        "name": "Nykaa - 112 ct",
        "url": "PASTE_NYKAA_URL_HERE",
        "count": 112,
        "site": "generic",
        "min_price": 1500,
        "max_price": 4000,
    },
    {
        "name": "Orami - 112 ct",
        "url": "PASTE_ORAMI_URL_HERE",
        "count": 112,
        "site": "generic",
        "min_price": 1500,
        "max_price": 4000,
    },
]

# Alert threshold: flag anything at or below this rupees-per-diaper.
# (Amazon mega box at Rs 2,039 = 18.2/pc; Blinkit 56ct at Rs 959 = 17.1/pc)
TARGET_PRICE_PER_PIECE = 17.5

# Paste your Telegram credentials here (or set them as environment vars).
TELEGRAM_BOT_TOKEN = "" or os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = "" or os.environ.get("TELEGRAM_CHAT_ID", "")

# True  = send the report every run (a daily digest).
# False = send only when a price changed or the target was hit.
ALWAYS_SEND_DAILY_REPORT = True

# True for scheduled runs. Set False (or use --setup) when you want to
# watch the browser or refresh the session by hand.
HEADLESS = True

NEEDED_PIECES = 112  # basis for the "best effective cost" comparison

# ----------------------------------------------------------------------
# Files live next to the script
# ----------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
HISTORY_FILE = BASE_DIR / "price_history.json"
LOG_CSV = BASE_DIR / "price_log.csv"
PROFILE_DIR = BASE_DIR / "browser_profile"   # cookies/session live here
DEBUG_DIR = BASE_DIR / "debug"               # failed pages get saved here

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

# ----------------------------------------------------------------------
# Price extraction helpers (pure functions - easy to test)
# ----------------------------------------------------------------------

def parse_rupees(text):
    """'2,039' / '2039.00' / '\u20b9 959' -> float, else None."""
    if not text:
        return None
    m = re.search(r"([\d,]+(?:\.\d+)?)", text.replace("\u20b9", " "))
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return None


def price_from_jsonld(html):
    """Look for schema.org offers.price inside <script type=application/ld+json>."""
    for block in re.findall(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html,
        re.DOTALL | re.IGNORECASE,
    ):
        try:
            data = json.loads(block.strip())
        except json.JSONDecodeError:
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if not isinstance(item, dict):
                continue
            offers = item.get("offers")
            if isinstance(offers, list) and offers:
                offers = offers[0]
            if isinstance(offers, dict):
                price = parse_rupees(str(offers.get("price", "")))
                if price:
                    return price
    return None


def price_from_title(title):
    """BigBasket/Blinkit put the price in the page title:
    '... Best Price of Rs 1019 - bigbasket' / '... Buy Online at \u20b9959 in India'"""
    if not title:
        return None
    m = re.search(r"(?:Rs\.?|\u20b9)\s*([\d,]+(?:\.\d+)?)", title)
    return parse_rupees(m.group(1)) if m else None


def prices_from_text(text):
    """All rupee amounts found in a blob of text, as floats."""
    if not text:
        return []
    out = []
    for m in re.findall(r"(?:\u20b9|Rs\.?)\s*([\d,]+(?:\.\d+)?)", text):
        val = parse_rupees(m)
        if val is not None:
            out.append(val)
    return out


def extract_price_from_html(html):
    """Static-HTML extraction: og:title -> <title> -> JSON-LD.
    Blinkit/BigBasket put the price in these for crawlers, and the
    server-rendered HTML (no JS) keeps it there."""
    if not html:
        return None
    m = re.search(
        r'<meta[^>]*property=["\']og:title["\'][^>]*content=["\']([^"\']*)["\']',
        html,
        re.IGNORECASE,
    )
    if m:
        price = price_from_title(m.group(1))
        if price:
            return price
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.DOTALL | re.IGNORECASE)
    if m:
        price = price_from_title(m.group(1))
        if price:
            return price
    return price_from_jsonld(html)


def static_html(url):
    """Fetch the raw server-rendered HTML with plain requests (no JS).
    Tries a normal browser UA, then a crawler UA - some sites only send
    the priced, server-rendered page to crawlers. '' on failure."""
    crawler_ua = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
    for ua in (USER_AGENT, crawler_ua):
        try:
            resp = requests.get(
                url,
                headers={"User-Agent": ua, "Accept-Language": "en-IN,en;q=0.9"},
                timeout=25,
            )
            if resp.ok and (
                "\u20b9" in resp.text or "Rs" in resp.text or "price" in resp.text.lower()
            ):
                return resp.text
        except requests.RequestException:
            continue
    return ""


def price_from_og_title(page):
    """The live page's og:title meta - survives client-side hydration."""
    el = page.query_selector('meta[property="og:title"]')
    if el:
        return price_from_title(el.get_attribute("content"))
    return None


# ----------------------------------------------------------------------
# Per-site scrapers (Playwright page + product dict -> price or raise)
# ----------------------------------------------------------------------

def scrape_amazon(page, product):
    for attempt in (1, 2):
        content = page.content()
        blocked = (
            "api-services-support@amazon.com" in content
            or "Enter the characters" in content
        )
        if blocked and attempt == 1:
            page.wait_for_timeout(5000)  # brief pause, then one retry
            page.reload(wait_until="domcontentloaded")
            page.wait_for_timeout(3000)
            continue
        if blocked:
            raise RuntimeError("Amazon showed a captcha (bot check)")
        break
    for selector in (
        "#corePriceDisplay_desktop_feature_div span.a-price-whole",
        "#corePrice_feature_div span.a-price-whole",
        "span.a-price-whole",
    ):
        el = page.query_selector(selector)
        if el:
            price = parse_rupees(el.inner_text())
            if price:
                return price
    m = re.search(r'"priceAmount"\s*:\s*([\d.]+)', page.content())
    if m:
        return float(m.group(1))
    raise RuntimeError("price element not found (layout may have changed)")


def scrape_flipkart(page, product):
    content = page.content()
    price = price_from_jsonld(content)
    if price:
        return price
    for selector in ("div.Nx9bqj", "div._30jeq3"):
        el = page.query_selector(selector)
        if el:
            price = parse_rupees(el.inner_text())
            if price:
                return price
    raise RuntimeError("price element not found (layout may have changed)")


def scrape_bigbasket(page, product):
    # Live page first: title, og:title, JSON-LD
    for price in (
        price_from_title(page.title()),
        price_from_og_title(page),
        price_from_jsonld(page.content()),
    ):
        if price:
            return price
    # The live app strips the price from the title after hydration -
    # the server-rendered HTML (no JS) still has it.
    price = extract_price_from_html(static_html(product["url"]))
    if price:
        return price
    # Last resort: lowest visible rupee amount within the entry's range
    lo, hi = product.get("min_price", 200), product.get("max_price", 6000)
    candidates = [p for p in prices_from_text(page.inner_text("body")) if lo <= p <= hi]
    if candidates:
        return min(candidates)
    raise RuntimeError("price not found (live page, static HTML, or body scan)")


def scrape_blinkit(page, product):
    for price in (
        price_from_title(page.title()),
        price_from_og_title(page),
        price_from_jsonld(page.content()),
    ):
        if price:
            return price
    # Server-rendered HTML keeps the price in og:title / <title>.
    # No ranged body scan here - the page lists many related products
    # and a cheaper Huggies pack would masquerade as our price.
    price = extract_price_from_html(static_html(product["url"]))
    if price:
        return price
    raise RuntimeError("price not found (live page or static HTML)")


def scrape_generic(page, product):
    """Order of attack: JSON-LD -> page title -> og:title -> price meta
    tags -> elements with 'price' in their class -> ranged body scan ->
    static server HTML."""
    for price in (
        price_from_jsonld(page.content()),
        price_from_title(page.title()),
        price_from_og_title(page),
    ):
        if price:
            return price
    el = page.query_selector(
        'meta[itemprop="price"], meta[property="product:price:amount"], '
        'meta[property="og:price:amount"]'
    )
    if el:
        price = parse_rupees(el.get_attribute("content"))
        if price:
            return price
    lo = product.get("min_price", 200)
    hi = product.get("max_price", 6000)
    # Elements whose class mentions "price" (FirstCry-style SPAs)
    texts = []
    for el in page.query_selector_all('[class*="price"], [class*="Price"]'):
        try:
            texts.append(el.inner_text())
        except Exception:
            continue
    candidates = [p for p in prices_from_text(" ".join(texts)) if lo <= p <= hi]
    if candidates:
        return min(candidates)
    candidates = [p for p in prices_from_text(page.inner_text("body")) if lo <= p <= hi]
    if candidates:
        return min(candidates)
    price = extract_price_from_html(static_html(product["url"]))
    if price and lo <= price <= hi:
        return price
    raise RuntimeError(
        "no price found - site may need a pincode before showing prices, "
        "or adjust min_price/max_price"
    )


SCRAPERS = {
    "amazon": scrape_amazon,
    "flipkart": scrape_flipkart,
    "bigbasket": scrape_bigbasket,
    "blinkit": scrape_blinkit,
    "generic": scrape_generic,
}

# ----------------------------------------------------------------------
# Fetch loop
# ----------------------------------------------------------------------

SETUP_SITES = [  # opened in --setup mode so you can set pincode / log in once
    "https://www.amazon.in",
    "https://www.firstcry.com",
    "https://www.jiomart.com",
    "https://blinkit.com",
]


def open_browser(p, headless):
    """Persistent profile so pincode cookies and Amazon session survive
    between runs. Real Chrome first (far less bot-like), then Chromium."""
    for channel in ("chrome", None):
        try:
            context = p.chromium.launch_persistent_context(
                str(PROFILE_DIR),
                headless=headless,
                channel=channel,
                locale="en-IN",
                timezone_id="Asia/Kolkata",
                viewport={"width": 1366, "height": 768},
            )
            print("[browser: {} | profile: {}]".format(channel or "chromium", PROFILE_DIR))
            return context
        except Exception as exc:
            last_error = exc
    raise RuntimeError("could not launch a browser: {}".format(last_error))


def run_setup():
    """One-time interactive session: opens the gated sites in a visible
    browser so you can set pincode 600091 and clear any Amazon captcha.
    Everything you do is saved in the profile for future headless runs."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        context = open_browser(p, headless=False)
        for url in SETUP_SITES:
            page = context.new_page()
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=60000)
            except Exception:
                pass  # leave the tab open anyway
        print(
            "\nIn the browser window:\n"
            "  1. Set your delivery pincode on FirstCry, JioMart and Blinkit\n"
            "  2. Open the Amazon tab; solve any captcha (logging in helps too)\n"
            "  3. Come back here when done\n"
        )
        input("Press Enter to save the session and close the browser... ")
        context.close()
    print("Setup saved. Scheduled runs will now reuse this session.")


def fetch_all_prices():
    """Returns list of dicts: {name, count, price or None, error or None}."""
    from playwright.sync_api import sync_playwright

    DEBUG_DIR.mkdir(exist_ok=True)
    results = []
    with sync_playwright() as p:
        context = open_browser(p, headless=HEADLESS)
        # Hide the tell-tale automation flag before any page script runs.
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        )
        # Skip images/media/fonts - faster and lighter.
        context.route(
            "**/*",
            lambda route: route.abort()
            if route.request.resource_type in ("image", "media", "font")
            else route.continue_(),
        )
        for product in PRODUCTS:
            entry = {
                "name": product["name"],
                "count": product["count"],
                "price": None,
                "error": None,
            }
            if "PASTE_" in product["url"]:
                entry["error"] = "URL not set yet (edit PRODUCTS in the script)"
                results.append(entry)
                continue
            page = context.new_page()
            try:
                page.goto(product["url"], wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(product.get("wait_ms", 3000))  # let client-side JS settle
                entry["price"] = SCRAPERS[product["site"]](page, product)
            except Exception as exc:  # keep going; report the failure
                entry["error"] = str(exc).splitlines()[0][:120]
                dump_debug(product, page)
            finally:
                page.close()
            results.append(entry)
        context.close()
    return results


def dump_debug(product, page):
    """On failure, save what the script actually saw - send me these
    files and the exact selector fix becomes obvious."""
    slug = re.sub(r"[^a-z0-9]+", "_", product["name"].lower()).strip("_")
    try:
        (DEBUG_DIR / (slug + "_live.html")).write_text(
            page.content(), encoding="utf-8"
        )
    except Exception:
        pass
    try:
        html = static_html(product["url"])
        if html:
            (DEBUG_DIR / (slug + "_static.html")).write_text(html, encoding="utf-8")
    except Exception:
        pass

# ----------------------------------------------------------------------
# History, comparison, report
# ----------------------------------------------------------------------

def load_history():
    if HISTORY_FILE.exists():
        try:
            return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def save_history(history):
    HISTORY_FILE.write_text(json.dumps(history, indent=2), encoding="utf-8")


def append_log(now_str, results):
    new_file = not LOG_CSV.exists()
    with LOG_CSV.open("a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if new_file:
            writer.writerow(["date", "product", "price"])
        for r in results:
            if r["price"] is not None:
                writer.writerow([now_str, r["name"], r["price"]])


def effective_cost(price, count, needed=NEEDED_PIECES):
    """Cost to obtain `needed` diapers buying whole packs of `count`."""
    packs = -(-needed // count)  # ceiling division
    return packs * price


def build_report(results, history):
    now = datetime.now()
    lines = ["Diaper price check - " + now.strftime("%d %b, %I:%M %p"), ""]
    any_change = False
    target_hit = False
    best = None  # (effective cost for NEEDED_PIECES, description)

    for r in results:
        if r["price"] is None:
            lines.append("WARN  {}: {}".format(r["name"], r["error"]))
            continue

        per_piece = r["price"] / r["count"]
        prev = history.get(r["name"], {}).get("price")
        if prev is None:
            trend = "(first check)"
        elif r["price"] < prev:
            trend = "DOWN from Rs {:,.0f}".format(prev)
            any_change = True
        elif r["price"] > prev:
            trend = "UP from Rs {:,.0f}".format(prev)
            any_change = True
        else:
            trend = "no change"

        flag = ""
        if per_piece <= TARGET_PRICE_PER_PIECE:
            flag = "  << target hit!"
            target_hit = True

        lines.append(
            "{}: Rs {:,.0f}  ({:.1f}/pc)  {}{}".format(
                r["name"], r["price"], per_piece, trend, flag
            )
        )

        cost = effective_cost(r["price"], r["count"])
        packs = -(-NEEDED_PIECES // r["count"])
        desc = "{} ({} pack{})".format(r["name"], packs, "s" if packs > 1 else "")
        if best is None or cost < best[0]:
            best = (cost, desc)

        history[r["name"]] = {"price": r["price"], "ts": now.isoformat(timespec="seconds")}

    if best:
        lines.append("")
        lines.append(
            "Cheapest way to {} diapers today: Rs {:,.0f} via {}".format(
                NEEDED_PIECES, best[0], best[1]
            )
        )

    return "\n".join(lines), any_change, target_hit


def send_telegram(message):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return False
    resp = requests.post(
        "https://api.telegram.org/bot{}/sendMessage".format(TELEGRAM_BOT_TOKEN),
        data={"chat_id": TELEGRAM_CHAT_ID, "text": message},
        timeout=30,
    )
    resp.raise_for_status()
    return True

# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------

def main():
    if "--setup" in sys.argv:
        run_setup()
        return
    try:
        results = fetch_all_prices()
    except Exception:
        # e.g. Playwright not installed yet
        print("Fatal error while fetching prices:\n" + traceback.format_exc())
        sys.exit(1)

    history = load_history()
    report, any_change, target_hit = build_report(results, history)

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    append_log(now_str, results)
    save_history(history)

    should_send = ALWAYS_SEND_DAILY_REPORT or any_change or target_hit
    print(report)
    if should_send:
        try:
            if send_telegram(report):
                print("\n[sent to Telegram]")
            else:
                print("\n[Telegram not configured - printed only]")
        except Exception as exc:
            print("\n[Telegram send failed: {}]".format(exc))


if __name__ == "__main__":
    main()