"""Builds two fictional REAXML mock feeds for Dwellicious / Listgate testing.

single-agent: every listing has the same agent (a solo agent / buyer's-agent style site)
team:         three agents, each listing with its own agent (some with two)

Agent headshots are free Unsplash photos, cropped square around the face by Unsplash.
"""
from xml.sax.saxutils import escape, quoteattr

U = "https://images.unsplash.com/"
P = {
    "qld1": U + "photo-1568605114967-8130f3a36994?w=1600",
    "qld2": U + "photo-1600596542815-ffad4c1539a9?w=1600",
    "int1": U + "photo-1600585154340-be6161a56a0c?w=1600",
    "int2": U + "photo-1600607687939-ce8a6c25118c?w=1600",
    "brick": U + "photo-1570129477492-45c003edd2be?w=1600",
    "modern": U + "photo-1512917774080-9991f1c4c750?w=1600",
    "lux": U + "photo-1580587771525-78b9dba3b914?w=1600",
    "lux2": U + "photo-1564013799919-ab600027ffc6?w=1600",
    "apt1": U + "photo-1502672260266-1c1ef2d93688?w=1600",
    "apt2": U + "photo-1522708323590-d24dbb6b0267?w=1600",
    "apt3": U + "photo-1493809842364-78817add7ffb?w=1600",
    "town": U + "photo-1605276374104-dee2a0ed3cd6?w=1600",
    "cottage": U + "photo-1449844908441-8829872d2607?w=1600",
    "land": U + "photo-1500382017468-9049fed747ef?w=1600",
}


# Unsplash headshots, cropped square around the face by Unsplash (fit=facearea), so circles centre on the face.
FACE = "?w=600&h=600&fit=facearea&facepad=3&q=80"
PHOTOS = {
    "Olivia Marsh": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2" + FACE,
    "Daniel Price": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7" + FACE,
    "Marcus Hale": "https://images.unsplash.com/photo-1560250097-0b93528c311a" + FACE,
}


def avatar(name):
    return PHOTOS[name]


AGENTS = {
    "olivia": ("Olivia Marsh", "Principal", "0400 111 201", "olivia@harpervale.example"),
    "daniel": ("Daniel Price", "Sales Agent", "0400 111 202", "daniel@harpervale.example"),
    "marcus": ("Marcus Hale", "Leasing and Sales", "0400 111 204", "marcus@harpervale.example"),
}
# Earlier versions had five agents; their listings now go to the three above.
REMAP = {"hannah": "olivia", "priya": "marcus"}


def agent_xml(key, i):
    name, _title, phone, email = AGENTS[key]
    return f"""    <listingAgent id="{i}">
      <name>{escape(name)}</name>
      <telephone type="mobile">{phone}</telephone>
      <email>{email}</email>
      <agentPhoto url={quoteattr(avatar(name))}/>
    </listingAgent>"""


L = [
    dict(tag="residential", id="S1001", status="current", agents=["olivia", "daniel"], type="House",
         price_view="Auction Saturday 13 December, 10am on site", price=1650000, price_display="no",
         addr=("", "24", "Wattlebird Street", "Norman Park", "4170"),
         beds=4, baths=2, garages=2, land=607, building=265, auction="2026-12-13T10:00:00",
         insp=["29-Nov-2026 10:00am to 10:30am", "06-Dec-2026 10:00am to 10:30am"],
         imgs=["qld1", "qld2", "int1", "int2"],
         headline="Elevated Queenslander with city glimpses and a pool",
         desc="""Set high on a 607m2 block in one of Norman Park's most tightly held streets, this renovated 1920s Queenslander keeps its soul (VJ walls, 3.3m ceilings, leadlight and wide verandahs) while delivering the space and flow a growing family needs.

The upper level holds three bedrooms, a family bathroom and a formal lounge that opens to the front verandah and its city glimpses. Downstairs is the everyday heart of the home: an open kitchen with stone benches and a butler's pantry, dining and living that spill onto a covered deck, the main bedroom with walk-in robe and ensuite, and a laundry with outdoor access.

Outside, the level backyard wraps around a saltwater pool, with a lawn big enough for cricket and a double lock-up garage under the house.

Highlights:
- 4 bedrooms, 2 bathrooms, 2 living areas
- Ducted air-conditioning and ceiling fans throughout
- 6.6kW solar and 5,000L water tank
- Walk to Norman Park station, the CityCat and Wynnum Road cafes
- Norman Park State School and Cannon Hill State High catchments

Auction on site Saturday 13 December at 10am unless sold prior.

Fictional listing for testing."""),
    dict(tag="residential", id="S1002", status="current", agents=["marcus"], type="House",
         price_view="Offers over $1,295,000", price=1295000, price_display="no",
         addr=("", "8", "Kookaburra Lane", "Camp Hill", "4152"),
         beds=4, baths=2, garages=2, land=680, insp=["29-Nov-2026 11:00am to 11:30am"],
         imgs=["brick", "modern"],
         headline="Low-set family home on a quiet cul-de-sac",
         desc="""Tucked at the end of a leafy cul-de-sac, this solid brick home offers single-level living with room for everyone, and a backyard the kids will never want to leave.

Three separate living zones mean nobody is fighting for the remote: a formal lounge at the front, an open kitchen and family room at the centre, and a rumpus that could easily become a fifth bedroom or home office. The kitchen has a gas cooktop, a dishwasher and plenty of bench space, and looks straight out to the north-facing deck.

All four bedrooms have built-in robes, and the main has its own ensuite. The 680m2 block is fully fenced, with a garden shed and side access for a boat or trailer.

- Whites Hill State College catchment
- 5 minutes to Camp Hill Marketplace and the Martha Street cafe strip
- Bus to the city at the end of the street

Fictional listing for testing."""),
    dict(tag="residential", id="S1003", status="current", agents=["daniel"], type="Unit",
         price_view="$895,000", price=895000, price_display="yes",
         addr=("12", "40", "Riverbend Terrace", "Bulimba", "4171"),
         beds=2, baths=2, garages=1, imgs=["apt1", "apt2", "apt3"],
         headline="Top-floor apartment steps from Oxford Street",
         desc="""Lock up and leave, or settle in for good: this top-floor apartment puts you a two-minute walk from Oxford Street's restaurants, the Bulimba ferry and the riverside parklands.

Floor-to-ceiling glass fills the open-plan living space with light and opens to a deep balcony with leafy river glimpses, made for long breakfasts. Both bedrooms are well separated for privacy, each with built-in robes and its own bathroom.

- Ducted air-conditioning
- Secure basement parking for one car, plus a storage cage
- Lift access, boutique block of 18
- Body corporate about $1,150 a quarter
- Currently owner-occupied; would also suit investors (estimated rent $650 a week)

Fictional listing for testing."""),
    dict(tag="residential", id="S1004", status="current", agents=["olivia"], type="House",
         price_view="Contact agent", price=2400000, price_display="no",
         addr=("", "3", "Jacaranda Rise", "Hawthorne", "4171"),
         beds=5, baths=3, garages=2, land=810, imgs=["lux", "lux2", "int1"],
         headline="Architect-designed riverside retreat",
         desc="""Designed by an award-winning Brisbane practice, this home turns its back on the street and opens itself to the river: a calm, private retreat that still sits minutes from the CBD.

Polished concrete, timber and glass set the tone across two levels. The ground floor flows from a chef's kitchen with butler's pantry, through dining and living, to a pool terrace and lawn framed by established gardens. Upstairs are four bedrooms, a second living room and a main suite with dressing room and an ensuite with a stone bath.

A separate guest wing with its own bathroom suits extended family, a teenager or a home office with client access.

- 5 bedrooms, 3 bathrooms, 3 living areas
- Climate-controlled wine room
- 10kW solar with battery storage
- Secure double garage with EV charger

Price on application. Private inspections by appointment.

Fictional listing for testing."""),
    dict(tag="residential", id="S1005", status="current", agents=["hannah"], type="Townhouse",
         price_view="Offers over $1,050,000", addr_display="no",
         addr=("", "55", "Banksia Avenue", "Coorparoo", "4151"),
         beds=3, baths=2, garages=2, imgs=["town"],
         headline="Private townhouse in a boutique block of four",
         desc="""One of just four townhouses in a quiet street, this home offers the space of a house without the upkeep.

Downstairs, the kitchen, dining and living open to a private courtyard that is sunny in winter and shaded in summer. Upstairs are three bedrooms, including a main suite with walk-in robe and ensuite, plus a study nook on the landing.

- Double lock-up garage with internal access
- Low body corporate fees
- Walk to Coorparoo Square, the train and Langlands Park

The street address will be released when you book an inspection.

Fictional listing for testing."""),
    dict(tag="residential", id="S1006", status="current", under_offer=True, agents=["marcus", "hannah"], type="House",
         price_view="Under offer", addr=("", "19", "Silky Oak Street", "Morningside", "4170"),
         beds=3, baths=2, carports=1, land=405, imgs=["cottage"],
         headline="Character cottage with a self-contained studio",
         desc="""A charming two-bedroom cottage, plus a self-contained studio out the back that is ideal for a teenager, guests or extra income.

The cottage keeps its original features, with a sunny kitchen and a back deck overlooking the garden. The studio has its own bathroom, kitchenette and entrance.

Now under offer. Contact Marcus or Olivia to hear about similar homes before they reach the market.

Fictional listing for testing."""),
    dict(tag="land", id="L1101", status="current", agents=["daniel"], type="Residential",
         price_view="$720,000", price=720000, price_display="yes",
         addr=("", "61", "Ironbark Road", "Carina", "4152"), land=405, frontage=12.5, imgs=["land"],
         headline="Level 405m2 block, ready to build",
         desc="""A rare chance to build new in an established street: a cleared, level 405m2 block with a 12.5m frontage, close to everything Carina offers.

- All services connected
- Zoned Low Density Residential
- Walk to Carina State School and local shops
- House-and-land packages available on request

Fictional listing for testing."""),
    # Sold
    dict(tag="residential", id="S0901", status="sold", agents=["olivia"], type="House",
         addr=("", "7", "Bottlebrush Court", "Norman Park", "4170"), beds=4, baths=2, garages=2,
         sold=(1580000, "yes", "2026-11-15"), imgs=["lux2"], headline="Sold under the hammer",
         desc="Sold at auction to the third of six registered bidders, after 41 groups through in three weeks.\n\nFictional listing for testing."),
    dict(tag="residential", id="S0902", status="sold", agents=["daniel"], type="Unit",
         addr=("4", "18", "Riverbend Terrace", "Bulimba", "4171"), beds=2, baths=1, garages=1,
         sold=(742000, "yes", "2026-11-08"), imgs=["apt3"], headline="Sold before auction",
         desc="Sold before auction to a local downsizer.\n\nFictional listing for testing."),
    dict(tag="residential", id="S0903", status="sold", agents=["olivia", "marcus"], type="House",
         addr=("", "112", "Grevillea Parade", "Hawthorne", "4171"), beds=5, baths=3, garages=2,
         sold=(2950000, "no", "2026-10-24"), imgs=["qld2"], headline="Sold off market",
         desc="Sold off market to a buyer from our database. Price undisclosed at the vendor's request.\n\nFictional listing for testing."),
    # Rentals
    dict(tag="rental", id="R2001", status="current", agents=["priya"], type="House", rent=750,
         available="2026-12-15", bond=3000, pets=True,
         addr=("", "9", "Lilly Pilly Street", "Coorparoo", "4151"), beds=3, baths=2, garages=1,
         insp=["02-Dec-2026 5:00pm to 5:15pm"], imgs=["modern", "int2"],
         headline="Renovated family home, available mid-December",
         desc="""Freshly renovated and ready for its next family. Three bedrooms with built-ins, two bathrooms, and an air-conditioned open-plan living area that opens to a covered patio and a fully fenced yard.

- Pets considered on application
- Lawn mowing included
- 10-minute walk to Coorparoo station and Coorparoo Square

Book an inspection online. Applications through 2Apply.

Fictional listing for testing."""),
    dict(tag="rental", id="R2002", status="current", agents=["priya"], type="Unit", rent=520,
         available="2026-12-01", bond=2080, addr=("6", "22", "Riverbend Terrace", "Bulimba", "4171"),
         beds=2, baths=1, garages=1, imgs=["apt2"], headline="Light-filled unit near the ferry",
         desc="""A bright two-bedroom unit in a small, well-kept block, a short stroll to the Bulimba ferry and Oxford Street.

- Balcony off the living room
- Air-conditioning in the living area and main bedroom
- One secure car space
- Water usage paid by the owner up to a fair-use limit

Fictional listing for testing."""),
    dict(tag="rental", id="R1901", status="leased", agents=["priya"], type="House", rent=690,
         addr=("", "31", "Wattlebird Street", "Norman Park", "4170"), beds=3, baths=1, carports=1,
         imgs=["cottage"], headline="Leased in 6 days",
         desc="Leased in six days at the full asking rent to a family relocating from Sydney.\n\nFictional listing for testing."),
    # Withdrawn
    dict(tag="residential", id="S0999", status="withdrawn", agents=[]),
]


F = "\n\nFictional listing for testing."
EXTRA = [
    dict(tag="residential", id="S1007", status="current", agents=["hannah"], type="House",
         price_view="Offers over $985,000", price=985000, price_display="no",
         addr=("", "14", "Paperbark Street", "Cannon Hill", "4170"), beds=3, baths=1, carports=2, land=405,
         insp=["30-Nov-2026 9:00am to 9:30am"], imgs=["cottage", "int2"],
         headline="Post-war charmer with room to grow",
         desc="""A neat post-war home on a level 405m2 block: move straight in and renovate later, or extend now and capture the value.

Three bedrooms, a light-filled lounge, a tidy original kitchen and a back deck overlooking a flat, fenced yard. High ceilings and timber floors throughout.

- Walk to Cannon Hill station and the Cannon Hill Kmart precinct
- Double carport with side access
- Cannon Hill State School catchment""" + F),
    dict(tag="residential", id="S1008", status="current", agents=["marcus"], type="House",
         price_view="Auction Saturday 6 December, 11am on site", price=1450000, price_display="no",
         addr=("", "42", "Lomandra Crescent", "Balmoral", "4171"), beds=4, baths=3, garages=2, land=506, auction="2026-12-06T11:00:00",
         insp=["29-Nov-2026 12:00pm to 12:30pm", "03-Dec-2026 5:30pm to 6:00pm"], imgs=["modern", "int1", "int2"],
         headline="Brand-new Hamptons-style home, ready to move in",
         desc="""Built in 2026 and never lived in, this four-bedroom home brings resort-style finishes to a quiet Balmoral street.

The open kitchen with an island bench, butler's pantry and integrated appliances anchors a living and dining space that flows through stacker doors to an alfresco area and plunge pool. Upstairs, three bedrooms share a family bathroom while the main suite has a walk-in robe and a double-vanity ensuite.

- Ducted air-conditioning with zoning
- Powder room and study downstairs
- Builder's warranty in place

Auction on site Saturday 6 December at 11am.""" + F),
    dict(tag="residential", id="S1009", status="current", agents=["daniel", "hannah"], type="Apartment",
         price_view="$649,000", price=649000, price_display="yes",
         addr=("305", "9", "Corella Street", "Coorparoo", "4151"), beds=2, baths=1, garages=1, imgs=["apt3", "apt1"],
         headline="Third-floor apartment above Coorparoo Square",
         desc="""Shops, cinema, gym and train, all downstairs. This two-bedroom apartment puts the best of Coorparoo at your door.

Open-plan living opens to a north-east balcony, and both bedrooms have built-in robes. The building has a residents' pool, a rooftop terrace and secure parking.

- One car space plus storage
- Body corporate about $1,050 a quarter
- Rented at $560 a week until March 2027""" + F),
    dict(tag="residential", id="S1010", status="current", agents=["olivia"], type="House",
         price_view="Expressions of interest close 10 December", addr=("", "2", "Tallowwood Place", "Bulimba", "4171"),
         beds=5, baths=4, garages=3, land=1012, imgs=["lux", "qld2", "int1"],
         headline="Grand estate on 1,012m2 near the river",
         desc="""One of Bulimba's landmark homes, offered for the first time in 25 years.

Set on 1,012m2 behind established gardens, the home offers five bedrooms, four bathrooms, formal and casual living, a home theatre and a self-contained guest suite. The resort backyard has a pool, a pavilion and room for a tennis court.

Expressions of interest close Thursday 10 December at 5pm unless sold prior.""" + F),
    dict(tag="residential", id="S1011", status="current", agents=["marcus"], type="Townhouse",
         price_view="$839,000", price=839000, price_display="yes", addr=("3", "17", "Grevillea Parade", "Morningside", "4170"),
         beds=3, baths=2, garages=1, imgs=["town"],
         headline="End townhouse with a big private yard",
         desc="""The end position in a complex of six gives this townhouse extra windows, extra light and a private yard bigger than many houses'.

- 3 bedrooms upstairs, main with ensuite
- Open-plan living to a covered patio
- Single garage plus a visitor space
- Pet-friendly complex""" + F),
    dict(tag="land", id="L1102", status="current", agents=["daniel"], type="Residential",
         price_view="Offers over $1,100,000", addr=("", "88", "Ironbark Road", "Camp Hill", "4152"), land=809, frontage=20,
         imgs=["land"], headline="809m2 corner block with subdivision potential",
         desc="""A rare corner block of 809m2 with a 20m frontage in the heart of Camp Hill. Subject to council approval, the size and zoning may allow a two-lot subdivision.

- Gentle slope to the street
- All services available
- Plans for two homes available to view""" + F),
    dict(tag="residential", id="S1012", status="current", agents=["hannah", "olivia"], type="House",
         price_view="Contact agent", addr_display="no", addr=("", "6", "Myrtle Way", "Hawthorne", "4171"),
         beds=4, baths=2, garages=2, land=607, imgs=["qld1", "int2"],
         headline="Quietly offered: Hawthorne family home",
         desc="""Offered quietly at the owner's request, this renovated four-bedroom home sits on a 607m2 block in a sought-after Hawthorne pocket.

Contact Olivia for the address and a private inspection.""" + F),
    # Sold
    dict(tag="residential", id="S0904", status="sold", agents=["hannah"], type="House",
         addr=("", "27", "Paperbark Street", "Cannon Hill", "4170"), beds=3, baths=1, carports=1,
         sold=(1015000, "yes", "2026-11-19"), imgs=["cottage"], headline="Sold in 9 days",
         desc="Sold in nine days with 37 groups through the first open home." + F),
    dict(tag="residential", id="S0905", status="sold", agents=["marcus"], type="Townhouse",
         addr=("1", "17", "Grevillea Parade", "Morningside", "4170"), beds=3, baths=2, garages=1,
         sold=(812000, "yes", "2026-11-02"), imgs=["town"], headline="Sold prior to auction",
         desc="Sold prior to auction to a first-home buyer." + F),
    dict(tag="residential", id="S0906", status="sold", agents=["daniel"], type="Apartment",
         addr=("602", "9", "Corella Street", "Coorparoo", "4151"), beds=2, baths=2, garages=1,
         sold=(705000, "no", "2026-10-28"), imgs=["apt1"], headline="Sold, price undisclosed",
         desc="Sold off market. Price undisclosed." + F),
    dict(tag="land", id="L0901", status="sold", agents=["daniel"], type="Residential",
         addr=("", "65", "Ironbark Road", "Carina", "4152"), land=405,
         sold=(698000, "yes", "2026-10-18"), imgs=["land"], headline="Sold: level 405m2 block",
         desc="Sold to a local builder." + F),
    # Rentals
    dict(tag="rental", id="R2003", status="current", agents=["priya"], type="Townhouse", rent=680,
         available="2026-12-08", bond=2720, pets=True, addr=("4", "17", "Grevillea Parade", "Morningside", "4170"),
         beds=3, baths=2, garages=1, insp=["03-Dec-2026 5:30pm to 5:45pm"], imgs=["town"],
         headline="Pet-friendly townhouse with a private courtyard",
         desc="""Three bedrooms, two bathrooms and a private courtyard in a pet-friendly complex, a short walk to Morningside station.

- Air-conditioning in the living area and all bedrooms
- Single garage plus a visitor space
- 12-month lease preferred""" + F),
    dict(tag="rental", id="R2004", status="current", agents=["priya"], type="House", rent=1150,
         available="2027-01-05", bond=4600, addr=("", "42", "Lomandra Crescent", "Balmoral", "4171"),
         beds=4, baths=3, garages=2, imgs=["modern", "int1"],
         headline="Executive home with plunge pool",
         desc="""A brand-new four-bedroom home with a plunge pool, ducted air and a double garage, available from early January.

- Pool maintenance included
- Study and powder room downstairs
- Suits professional couples or families""" + F),
    dict(tag="rental", id="R1902", status="leased", agents=["priya"], type="Apartment", rent=560,
         addr=("305", "9", "Corella Street", "Coorparoo", "4151"), beds=2, baths=1, garages=1,
         imgs=["apt3"], headline="Leased at the first inspection",
         desc="Leased at the first inspection, with four applications received." + F),
]


def listing_xml(l, single):
    mod = "2026-11-26-06:00:00" if l["status"] in ("current", "withdrawn") else "2026-11-20-09:00:00"
    out = [f'  <{l["tag"]} modTime="{mod}" status="{l["status"]}">', "    <agentID>MOCK01</agentID>", f'    <uniqueID>MOCK-{l["id"]}</uniqueID>']
    if l["status"] == "withdrawn":
        out.append(f'  </{l["tag"]}>')
        return "\n".join(out)
    if l.get("under_offer"):
        out.append('    <underOffer value="yes"/>')
    keys = ["olivia"] if single else list(dict.fromkeys(REMAP.get(k, k) for k in l["agents"]))
    out += [agent_xml(k, i + 1) for i, k in enumerate(keys)]
    if l["tag"] == "rental":
        out.append(f'    <rent period="week" display="yes">{l["rent"]}</rent>')
        out.append(f'    <priceView>${l["rent"]} per week</priceView>')
        if l.get("available"):
            out.append(f'    <dateAvailable>{l["available"]}</dateAvailable>')
        if l.get("bond"):
            out.append(f'    <bond>{l["bond"]}</bond>')
    else:
        if l.get("price_view"):
            out.append(f'    <priceView>{escape(l["price_view"])}</priceView>')
        if l.get("price"):
            out.append(f'    <price display="{l.get("price_display", "no")}">{l["price"]}</price>')
    sub, num, street, suburb, pc = l["addr"]
    out.append(f'    <address display="{l.get("addr_display", "yes")}">')
    if sub:
        out.append(f"      <subNumber>{sub}</subNumber>")
    out += [f"      <streetNumber>{num}</streetNumber>", f"      <street>{escape(street)}</street>", f'      <suburb display="yes">{suburb}</suburb>',
            "      <state>QLD</state>", f"      <postcode>{pc}</postcode>", "      <country>Australia</country>", "    </address>"]
    out.append(f'    <{"landCategory" if l["tag"] == "land" else "category"} name="{l["type"]}"/>')
    out.append(f'    <headline>{escape(l["headline"])}</headline>')
    out.append(f'    <description>{escape(l["desc"])}</description>')
    if l["tag"] != "land":
        f = [f"<bedrooms>{l['beds']}</bedrooms>", f"<bathrooms>{l['baths']}</bathrooms>"]
        if l.get("garages"):
            f.append(f"<garages>{l['garages']}</garages>")
        if l.get("carports"):
            f.append(f"<carports>{l['carports']}</carports>")
        out.append("    <features>" + "".join(f) + "</features>")
    if l.get("pets"):
        out.append("    <allowances><petFriendly>yes</petFriendly><furnished>no</furnished></allowances>")
    if l.get("land"):
        fr = f'<frontage unit="meter">{l["frontage"]}</frontage>' if l.get("frontage") else ""
        out.append(f'    <landDetails><area unit="squareMeter">{l["land"]}</area>{fr}</landDetails>')
    if l.get("building"):
        out.append(f'    <buildingDetails><area unit="squareMeter">{l["building"]}</area></buildingDetails>')
    if l.get("auction"):
        out.append(f'    <auction date="{l["auction"]}"/>')
    if l.get("sold"):
        p, disp, d = l["sold"]
        out.append(f'    <soldDetails><soldPrice display="{disp}">{p}</soldPrice><soldDate>{d}</soldDate></soldDetails>')
    if l.get("insp"):
        out.append("    <inspectionTimes>" + "".join(f"<inspection>{i}</inspection>" for i in l["insp"]) + "</inspectionTimes>")
    ids = "mabcdefgh"
    out.append("    <objects>")
    out += [f'      <img id="{ids[i]}" url="{P[k]}"/>' for i, k in enumerate(l["imgs"])]
    out.append("    </objects>")
    out.append(f'  </{l["tag"]}>')
    return "\n".join(out)


def build(single):
    items = L[:-1] + EXTRA + L[-1:]
    who = "a single agent (Olivia Marsh) on every listing" if single else "a team of three agents (Olivia Marsh, Daniel Price, Marcus Hale), each listing with its own agent or pair"
    head = f"""<?xml version="1.0" encoding="utf-8"?>
<!--
  Mock REAXML feed for testing Dwellicious and Listgate: {who}.
  Everything is fictional: agency (Harper &amp; Vale), agents, phone numbers, emails and street names.
  Suburbs are real Brisbane suburbs. Listing photos and agent headshots are free Unsplash images
  (agent headshots cropped square around the face).
  28 listings: 14 for sale, 7 sold, 6 rentals, 1 withdrawn.
  Covers auction, offers over, price shown, price hidden, address hidden, under offer, EOI, land,
  sold with price shown and undisclosed, rentals current and leased, and a withdrawal.
-->
<propertyList date="2026-11-26-06:00:00" username="mock" password="">
"""
    return head + "\n\n".join(listing_xml(l, single) for l in items) + "\n</propertyList>\n"


for name, single in (("mock-reaxml-single-agent.xml", True), ("mock-reaxml-team.xml", False)):
    open(__import__("os").path.join(__import__("os").path.dirname(__file__), "..", "..", "..", "apps", "web", "public", "mock", name), "w").write(build(single))
    print("wrote", name)
