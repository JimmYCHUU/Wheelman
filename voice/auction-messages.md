# The messages sent to auction customers
#
# One part per message. A part starts at a line like ===== car_secured ===== and runs to the
# next one. Lines starting with # are notes for you and are never sent. Edit the wording freely:
# a change takes effect on the next message, with no restart.
#
# How the parts are filled in:
#   {word}        a fact Wheelman puts in from the order, the live auction or the stock list
#   {if_word}     prints nothing; the paragraph it sits in is kept only when that is true
#   {{NAME}}      the customer's first name ("Hi {{NAME}}," becomes "Hi," when there is none)
#   [CAPITALS?]   a blank only you can fill in. The page highlights it. Type over it, or type
#                 what you know into "Add what you know" (for example: we bid 1.2m, sold for 1.31m)
#   A paragraph whose fact does not apply is left out. For example the deposit paragraph is left
#   out once a deposit has been paid.
#   A message is always written. What Wheelman cannot find out (no such car in the website's
#   coming auctions, say) becomes a blank for you to fill in, never a refusal.
#
# Facts used in more than one message:
#   {car_wanted}     the car they asked for, such as "Subaru XV Hybrid"
#   {model}          the model alone, such as "XV Hybrid"
#   {car}            the car that was secured for them, such as "2021 Toyota Hiace DX"
#   {deposit_amount} the deposit asked for on the order, such as "$1,500"
#   {deposit_paid}   the deposit they have paid
#   {due}            what is still to pay on the order
#   {stage_lines}    the charges for the current stage, one per line
#   {if_stage_lines} keeps its paragraph only when there are such charges on the order
#   {sender}         the name on the last line (FIRST_REPLY_SENDER in the .env file)
#
# The first ten parts are written from messages your team has really sent. The parts marked
# FIRST DRAFT are mine, written without an example: please correct them.

# Short pieces of wording Wheelman chooses between:
@missed: we missed it by a small margin. The vehicle sold for {sold_for}
@passed_in: it was passed in
@outcome_unknown: we did not win it. The vehicle sold for {sold_for}
@alternative: {n}. {title}\nGrade: {grade}\nOdo: {km}\n{url}
@arriving: They are expected to arrive by {arrival_date}.
@where_japan: it is in Japan, waiting to be shipped
@where_transit: it has left Japan and is on its way to Australia
@where_arrived: it has arrived in Australia and is going through compliance
@where_secured: it has been secured at auction and we are arranging the next steps
@where_searching: we are still searching the Japan auctions for the right one

===== first_estimate =====
# A new order with no deposit yet. The estimate is worked out by the website's calculator at
# their target bid. When there is no target bid on the order, or no car of that model is in the
# coming auctions for the calculator to work on, the figures are left as blanks for you, and
# the breakdown is left out.
Hi {{NAME}},

Thank you for your {car_wanted} enquiry.

We have noted your preferred vehicle details:

{wanted_lines}

Target auction bid: approx. {target_bid} JPY

Based on this target bid, the estimated landed and complied total is:

Estimated Landed Total: {total} AUD
GST & duties included.

{if_breakdown}The estimate includes:

{cost_lines}

The refundable auction deposit required to start bidding is {deposit_amount} AUD.

Once the deposit is received, we will start monitoring suitable {car_wanted} auction vehicles for you.

Before we place any bid, we will review the available auction sheet, photos and vehicle details. Where inspection is available, we will arrange the inspection information and extra photos first, then send the vehicle to you for approval.

We will not place a bid without your confirmation.

Please note the final landed price may change slightly depending on the actual winning auction price, exchange rate, shipping timing and vehicle condition.

You can place the deposit using the link below:
[DEPOSIT LINK?]

Regards,
{sender}

===== lot_closed =====
# The auction for the car they asked about has passed, and no deposit is paid.
Hello {{NAME}},

Thank you for your enquiry, and apologies for the delayed response.

Unfortunately, bidding for the vehicle you were interested in has closed. However, the {car_wanted} regularly comes through Japanese live auctions, so we should be able to find a suitable vehicle for you.

If you would like to proceed, you can start by placing a {deposit_amount} AUD deposit using the link below. Once received, we will begin searching and share suitable options with you:
[DEPOSIT LINK?]

We never bid blindly. Before placing any bid, we provide additional photos and auction notes, and our Japanese inspector personally inspects the vehicle.

To help us find the right car more quickly, could you please confirm {missing_details}?

We look forward to helping you find the right {model}.

Kind regards,
{sender}

===== lots_coming =====
# Several matching cars are in the coming auctions, and the customer can bid on the website.
Hi {{NAME}},

Thank you for your enquiry about the {car_wanted}.

We have {lot_count} {car_wanted} vehicles coming up {auction_when} that match your requirements.
You can place your bid through our Live Auction platform:
{model_url}

Our experienced bidding and inspection team in Japan carefully inspects every vehicle before the final purchase. We will provide you with up-to-date photos and a detailed condition report so you can review everything before confirming the purchase.

We look forward to helping you secure the right {model}.

Happy bidding!
Kind regards,
{sender}

===== lot_offer =====
# A matching car is in the coming auctions. These are only the opening lines: the car's details,
# its link, the bid, the landed cost and the rest follow from the file auction-offer.md.
Hi {{NAME}},

We found this {lot_name} {auction_when}.

===== lot_offer_manual =====
# The same message when the car is not on the website's auction list (or nothing there suits):
# everything Wheelman cannot look up is a blank for you. Type what you know into "Add what you
# know" to fill them in one go, for example:
#   2021, 14,200 km, grade 4, tomorrow, bid 1.15m, landed 20400, https://photos.app.goo.gl/…
#   {if_deposit}  keeps its paragraph only while the customer has not paid a deposit
Hi {{NAME}},

We found one {lot_name} {auction_when}.

Year: {year}
Odometer: {lot_km}
Auction Grade: {grade}

You can see the photos here:
{photo_link}

We can suggest to bid on this vehicle {bid}.
If we win this auction, the total landed price will be {landed}.

{if_deposit}If you would like to proceed, you can start by placing the deposit using the link below:
[DEPOSIT LINK?]

Would you like us to bid on this car? Please let us know your thoughts.

Regards,
{sender}

===== lot_short =====
# The short way of offering a car. A car that is not on the website's list is left as blanks.
Hi {{NAME}},

There is one {auction_when}: {lot_title}
{lot_km} driven
{lot_url}

Would you like to bid on this car? Or we can keep checking other options{km_limit}.

===== search_update =====
# FIRST DRAFT. A follow-up is due and nothing suitable has come up.
Hi {{NAME}},

Just an update on your {car_wanted}. We have been checking the Japan auctions and have not found a suitable one yet.

We'll keep searching and send you the next good match as soon as we find one.

Regards,
{sender}

===== deposit_reminder =====
# FIRST DRAFT. A follow-up is due and no deposit has been paid.
Hi {{NAME}},

Just following up on your {car_wanted} enquiry.

To start bidding for you, we need the refundable auction deposit of {deposit_amount} AUD. You can place it using the link below:
[DEPOSIT LINK?]

Once it is received, we will send you suitable vehicles for approval. We will not place a bid without your confirmation.

Regards,
{sender}

===== deposit_received =====
# FIRST DRAFT. A deposit has appeared on the order.
Hi {{NAME}},

Thank you, we have received your deposit of {deposit_paid} AUD.

We will now start monitoring suitable {car_wanted} auction vehicles for you. Before we place any bid, we will send you the vehicle with photos and auction notes for your approval.

Regards,
{sender}

===== bid_lost =====
# The auction was held and we did not win. {outcome} is one of the three short pieces at the top.
Hi {{NAME}},

Just an update on the {lot_name}. We placed the bid at {our_bid}, but unfortunately {outcome}.

We'll keep searching and send you the next good match as soon as we find one within your budget.

Regards,
{sender}

===== bid_lost_stock =====
# The same, when cars of that model are in our own stock in Japan or on the way.
Hi {{NAME}},

Unfortunately, we bid on the {lot_name} for {our_bid} and {outcome}.

However, we currently have {stock_count} available in Japan that {stock_match} your requirements. {arriving}

{alternatives}

Please have a look and let us know which one you prefer.

If you are not interested in these, we can continue searching at auction, or we can process a refund.

Regards,
{sender}

===== stock_priced =====
# One car from our own stock, priced for an auction customer. Type the stock number and the two
# prices into "Add what you know", for example: stock 1234, purchase 2.38m, landed 35900
Hi {{NAME}},

{stock_title}
{stock_lines}

Purchase price {purchase_price}.
Landed price is {landed_price}.

Including Japan agent fee, freight, port and customs, compliance package, Carbarn agent fee and GST.

Would you like to proceed with this {model}?

Regards,
{sender}

===== secured =====
# FIRST DRAFT. We won: the order has moved to "car secured".
Hi {{NAME}},

Good news: we won the auction and your {car} is secured.

{car_lines}

Winning price: {winning_price}

{if_stage_lines}The next payment covers:

{stage_lines}

{if_deposit_paid}Deposit already paid: {deposit_paid} AUD

{if_due}Amount due now: {due} AUD

We will send the invoice and payment details separately. Once payment is received, we will book shipping and keep you updated.

Regards,
{sender}

===== payment_due =====
# FIRST DRAFT. A payment is outstanding and a follow-up is due.
Hi {{NAME}},

Just a reminder that a payment of {due} AUD is due on your {car}.

{stage_lines}

Please let us know once it has been paid, or if you would like the invoice sent again.

Regards,
{sender}

===== shipping_booked =====
# FIRST DRAFT. The order has moved to shipping and compliance.
Hi {{NAME}},

An update on your {car}: it is now being prepared for shipping to Australia.

Vessel: {ship}
Sailing from Japan: {sailing_date}
Expected arrival: {arrival_date}

{if_stage_lines}The charges for this stage are:

{stage_lines}

We will let you know as soon as it is on the water.

Regards,
{sender}

===== on_the_water =====
# FIRST DRAFT. The stock record shows the car has left Japan.
Hi {{NAME}},

Your {car} has left Japan and is on its way to Australia.

Expected arrival: {arrival_date}

Once it arrives it goes through customs and then compliance. We will update you at each step.

Regards,
{sender}

===== arrived =====
# FIRST DRAFT. The stock record shows the car has arrived.
Hi {{NAME}},

Good news: your {car} has arrived in Australia.

It is now going through customs clearance and compliance.

{stage_lines}

We expect it to be ready by {ready_date} and will confirm as soon as it is.

Regards,
{sender}

===== ready =====
# FIRST DRAFT. The car is ready to hand over.
Hi {{NAME}},

Your {car} is ready.

{if_due}The remaining balance is {due} AUD, payable before collection.

You can collect it from our yard, or we can arrange delivery to you. Please let us know which you prefer, and a day that suits.

📍 Unit D3, 128-130 Frances Street, Lidcombe NSW 2141
📞 0423 840 130
🕛 Open 7 days, 8 AM–5 PM

Regards,
{sender}

===== thanks =====
# FIRST DRAFT. The order is completed.
Hi {{NAME}},

Thank you for importing your {car} with Carbarn. We hope you are enjoying it.

If anything comes up with the car, or you would like help finding another one, just message us.

Regards,
{sender}

===== refund =====
# FIRST DRAFT. The order has been refunded.
Hi {{NAME}},

Your auction deposit of {deposit_paid} AUD has been refunded. It should reach your account by {refund_date}.

Thank you for considering Carbarn. If you would like us to look for a car again in future, just let us know.

Regards,
{sender}

===== progress_update =====
# FIRST DRAFT. A follow-up is due on the dashboard and nothing is owing. {where} is one of the short
# pieces at the top.
Hi {{NAME}},

A quick update on your {car_or_wanted}: {where}.

Next step: {next_step}

We will keep you updated.

Regards,
{sender}
