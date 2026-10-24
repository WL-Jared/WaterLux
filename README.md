# WaterLux Installations Website

Static HTML website for waterluxit.com, hosted on Vercel. Every lead form sends to GoHighLevel through one small Vercel function (`api/lead.js`), so the GHL key is never visible in the page code.

## What's in this folder

| Path | What it is |
|---|---|
| `index.html` | Home page |
| `free-water-test/` | Main landing page for ads |
| `complete-system/` | The WaterLux Complete System |
| `about/` | About and Russ |
| `reviews/` | Reviews (GHL review widget goes here) |
| `service-areas/` | Towns and counties served |
| `contact/` | Contact form, phone, text, map |
| `thank-you/` | Shown after every form. Holds the GHL booking calendar |
| `privacy/`, `sms-terms/` | Required for A2P 10DLC texting approval |
| `404.html` | Page not found |
| `assets/styles.css` | All styling (brand colors are at the top) |
| `assets/site.js` | Menu, ad tracking IDs, form handling, calendar loader |
| `api/lead.js` | Sends each lead to GHL |
| `vercel.json` | Clean URLs and security headers |

## How a lead flows

1. A visitor fills out a form. It asks for name, mobile, optional email, ZIP, city/well, own/rent, and an SMS consent checkbox that is unchecked by default.
2. `/api/lead` creates or updates the contact in GHL and adds tags.
3. It also adds a note with their answers, the ad source (UTMs, Facebook/Google click IDs), and a timestamped SMS consent record.
4. The visitor lands on `/thank-you/` and picks a time on your GHL calendar, already filled in with their name, phone and email.

**Tags the site adds** (build your workflows on these):

- `website-lead`: every form
- `form-free-water-test`, `form-home`, `form-complete-system` or `form-contact`: which form
- `homeowner` or `renter`
- `water-city`, `water-well` or `water-not-sure`
- `sms-opt-in`: only when they checked the consent box
- `src-facebook`, `src-google-ads`, `src-google-organic`, or `src-<utm_source>`: ad source when known
- `took-water-check`: they used the Water Check before booking. What they checked, their water source and which systems the site recommended are all in the lead note.

---

## Setup checklist

### Step 1. GoHighLevel

**a. Create a Private Integration token**

1. Go to GHL sub-account > Settings > Private Integrations > Create new integration.
2. Name it "WaterLux Website".
3. Give it these scopes:
   - View Contacts
   - Edit Contacts
   - View Opportunities
   - Edit Opportunities
4. Copy the token.

Treat the token like a password. It only goes into Vercel (Step 3), never into a page.

**b. Find your Location ID**

It's under Settings > Business Profile. It's also the code after `/location/` in your GHL browser address bar.

**c. Build the workflow**

Go to Automation > Workflows > Create.

- **Trigger:** Contact Tag added = `website-lead`
- **Suggested actions:**
  1. Create/Update Opportunity in your pipeline, at the "New Lead" stage.
  2. Internal Notification: email russ@waterluxit.com and jared@waterluxit.com, plus an SMS/app alert to Russ, saying "New website lead: {{contact.name}} {{contact.phone}}".
  3. If/Else: contact has tag `sms-opt-in`
     - **Yes:** send an SMS like "Hi {{contact.first_name}}, this is Russ with WaterLux. Thanks for requesting a free water test! Grab a time here: [calendar link] or reply with a day that works."
     - **No:** create a task for Russ to call the lead.
  4. Add a wait, then a reminder if no appointment was booked.

Only text people who have the `sms-opt-in` tag or who texted you first.

If you'd rather have the site create the opportunity itself, set `GHL_PIPELINE_ID` and `GHL_PIPELINE_STAGE_ID` in Step 3. Either way works. Don't do both, or you may get two opportunities per lead.

**d. Calendar on the thank-you page**

1. Go to Calendars and open your "Free Water Test" calendar.
2. Click Share or Embed and copy the calendar ID. It's the code at the end of the booking link: `.../widget/booking/THIS_PART`.
3. Open `thank-you/index.html`, find `PASTE_CALENDAR_ID`, and replace it with that ID.

**e. Reviews widget**

1. Go to Reputation > Widgets, create a review widget, and copy its embed code.
2. Paste it inside the box marked `data-review-widget` in `index.html` and `reviews/index.html`. Replace the placeholder text inside that box.
3. In `reviews/index.html`, replace the `#` on the "Leave a Google Review" button with your Google review link.

**f. A2P 10DLC texting registration**

If it isn't done yet, register in GHL (Settings > Phone Numbers > Trust Center).

- **Privacy policy URL:** `https://waterluxit.com/privacy/`
- **Terms URL:** `https://waterluxit.com/sms-terms/`
- **Opt-in method:** describe it as "website form with an optional, unchecked SMS consent checkbox".

### Step 2. GitHub

1. Create a repository, for example `waterlux-website`, under a WaterLux-owned account.
2. Choose Add file > Upload files.
3. Drag in **everything inside this folder**, keeping the folders.
4. Commit.

### Step 3. Vercel

1. Choose Add New > Project, then import the repository.
2. Set Framework Preset to **Other**.
3. Leave Build Command and Output Directory empty.
4. Before deploying, open **Environment Variables** and add:

| Name | Value | Required |
|---|---|---|
| `GHL_PRIVATE_TOKEN` | token from Step 1a | Yes |
| `GHL_LOCATION_ID` | ID from Step 1b | Yes |
| `GHL_PIPELINE_ID` | pipeline ID | Optional |
| `GHL_PIPELINE_STAGE_ID` | stage ID | Optional |
| `ALLOWED_ORIGINS` | `https://waterluxit.com,https://www.waterluxit.com` | Optional (this is the default) |

5. Deploy.

If you add or change a variable later, go to Deployments > ⋯ > Redeploy so it takes effect.

### Step 4. Test it

1. Open your `*.vercel.app` link and submit the Free Water Test form with your own phone number.
2. Confirm all of the following:
   - The thank-you page loads.
   - The contact appears in GHL with the tags and a "WEBSITE LEAD" note.
   - Your workflow fires.
3. If something fails, check Vercel > Project > Logs and look for `LEAD FAILED`. The line shows GHL's error **and the full lead**, so no lead is ever lost.

### Step 5. Connect waterluxit.com

1. In Vercel, go to Settings > Domains and add `waterluxit.com` and `www.waterluxit.com`.
2. At your domain registrar, add **only** the A record and CNAME that Vercel shows you.

Do **not** change the MX records or the nameservers. They run your Google Workspace email.

If the domain currently points to a GHL site, keep any GHL funnels on a subdomain such as `book.waterluxit.com`.

### Step 6. Ad tracking

Open `assets/site.js` and fill in the two IDs at the top:

```js
var GA4_ID = 'G-XXXXXXXXXX';
var META_PIXEL_ID = '123456789012345';
```

The site then tracks:

- page views on every page
- a `Lead` event in Meta and `generate_lead` in GA4 on every successful form
- call and text taps as `call_click` and `text_click`

---

## Editing the Water Check recommendations

Open `assets/water-check.js`. At the top are two simple lists:

- `SYSTEMS`: the 6 systems (name, one-line description, page link)
- `SYMPTOMS`: every checkbox, which systems it points to (most important first), the "why" shown to the customer, and optional "where to look" advice

Change the `systems: [...]` list on any symptom to re-map it. If a customer's answers point to both a softener and a carbon tower, the results automatically recommend the Complete System instead.

## Finishing touches (search for `EDIT:` in the files)

- **Videos:** the home page ("Meet Russ in 60 seconds") and the Free Water Test page ("What happens at your free water test") have video slots. Upload to YouTube or Vimeo, then follow the `EDIT:` comment above each slot to paste the embed.
- **Background photos:** upload these to `assets/images/bg/` with these exact names and they appear automatically, with the right overlay already applied. Until a photo is added, that section keeps its plain brand background.
  - `hero-kitchen.jpg`: home page hero. A bright kitchen, water pouring into a clear glass, with the subject on the right side of the frame.
  - `showerhead.jpg`: the navy "Hard water is quietly costing you" section. A chrome showerhead or faucet with water running.
  - `home-exterior.jpg`: the navy closing banner on every page. A St. Louis area home exterior in warm light.
  - `water-ripple.jpg`: the Water Check section. A generated texture is already included; replace it with a real soft water-surface photo if you like.

  Use photos about 2400px wide, saved as JPG under about 400KB. Free sources for business use: Unsplash and Pexels.
- **System photos:** the system cards (home page and Our Systems) show a placeholder until a photo exists. Just upload images with these exact names to `assets/images/systems/` and they appear automatically: `carbon-tower.jpg`, `water-softener.jpg`, `complete-system.jpg`, `air-injection.jpg`, `uv-light.jpg`, `reverse-osmosis.jpg`. Photos on a white or light background look best.
- **Photos:** About has placeholders for Russ and the team. Put images in `assets/images/`. Then replace each placeholder `<div class="ph" ...>...</div>` with something like:
  ```html
  <img src="/assets/images/rusty.jpg" alt="Russ from WaterLux" style="border-radius:14px;width:100%;height:auto">
  ```
- **Share image:** add a 1200x630 `assets/og-image.jpg` (the banner works well). Then uncomment the `og:image` line near the top of each page.
- **Confirm facts:**
  - the water test list and appointment length (Free Water Test page)
  - the chemicals list and maintenance details (Complete System page)
  - the towns list (Service Areas page)
- **Privacy and SMS Terms:** these are starting templates. Have them reviewed and set the dates.
- **Hours and email:** optional. Add them in the footer and on Contact if you want them listed.

## Updating the site later

Edit the file in GitHub (pencil icon) and commit. Vercel republishes in about a minute.

The header and footer are repeated in each page file. If you change a nav link or the phone number, update it in every `index.html`. GitHub search (press `.` on the repo) makes this quick.

## Still open (shown on the site in [brackets] or marked EDIT:)

- Days of operation (done: Monday to Friday, 8:00 AM to 5:00 PM CST)
- Financing provider and terms ([confirm financing terms])
- What the free water test measures
- Install time still about 3 hours?
- Google review count, rating and Google Business Profile link (add the live Google Reviews embed)
- Russ's founding story and role (owner, technician or both)
- What the size numbers mean for each system family
- Names for Air Injection and UV Light
- Photos: Russ at a tap, installs, truck
- SMS consent language and A2P status on the GHL sub-account
