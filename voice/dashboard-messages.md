# Dashboard messages: the "Which message?" list for text conversations
#
# One part per message. A part starts at a line like ===== price_question ===== and runs to the
# next one. Lines starting with # are notes for you and are never sent. Edit the wording freely,
# or add a message of your own: a change takes effect on the next message, with no restart.
#
# Each part starts with its details, one per line:
#   @label:  the name in the "Which message?" list
#   @fits:   when it is offered: the conversation must show at least one of these (see below)
#   @needs:  (optional) it is offered only when all of these are true too
#   @not:    (optional) never offered when one of these is true
#   @fit: no (optional) written by code, word for word, with no AI; a Prompt or Rewrite still
#            goes to the AI
# Only the messages that fit the conversation are offered; the best fit comes first.
#
# What the conversation can show (for @fits, @needs and @not):
#   what they asked about: availability, price_negotiation, inspection_booking, finance,
#     trade_in, deposit_hold, delivery_interstate, history_kms, rego_roadworthy, warranty,
#     photos_video, vehicle_details, location_hours, after_sale, complaint, import_sourcing, general
#   first reply, later reply, buyer (they have bought from us), far away (they said so),
#   their offer (they named a figure), parting (they are walking away or not interested),
#   car (a car of ours is in the conversation), car available (at the showroom now),
#   car on its way (in Japan or at sea), car sold (sold, or held by another customer's deposit),
#   no car, any (always offered)
#   follow-up (a follow-up opened from the Follow-ups list), inspection passed (the booked time
#     of their inspection or test drive has gone by), quiet (days without a reply to our message),
#     reminder (their visit is booked for tomorrow)
#   booking made (their newest message is a booking through the website)
#
# Facts Wheelman fills in. A paragraph whose fact does not apply is left out:
#   {greeting}           the greeting for the time of day with their name; left out when we have
#                        already written to them today
#   {sign_off}           Regards, Team Carbarn; left out when we have already written today
#   {car} {car_link} {price} {km}   the car, its page, its advertised price, its odometer
#   {where}              where the car is: at our Lidcombe showroom, on its way, in Japan
#   {inclusions}         what its price includes, from its Included list
#   {if_inclusions}      keeps its paragraph only when the car's Included list has something in it
#   {price_reply}        your price reply (voice/price-reply.md), word for word
#   {invitation}         your invitation to inspect with the booking link (voice/inspection-invite.md);
#                        the online video link when they said they are far away
#   {first_reply_block}  your standard first-reply block (voice/first-reply.md)
#   {address_block}      the address, hours and phone, as in that block; its closing "Team Carbarn"
#                        line only on the first message of the day
#   {stock_link} {finance_link} {warranty_link} {importing_link}   our website's pages
#   {if_warranty}        keeps its paragraph only when the car includes the 5-year warranty
#   {if_no_warranty}     keeps its paragraph only when it does not
#   {booked_day} {booked_time}   on a follow-up after an inspection: "today", "yesterday" or
#                        "on Wednesday 21 October", and "2 pm"
#   {booking_kind} {booked_when}   "inspection" or "test drive", and "today", "tomorrow" or
#                        "on Wednesday 21 October", for the booking in hand: the follow-up's,
#                        else the newest one they made through the website
#   {address}            136 Frances Street, Lidcombe NSW 2141
#   {if_onsite} {if_online}   keeps its paragraph only for a visit to the yard, or only for an
#                        online video inspection
#   {deposit_offer}      the holding-deposit line (@deposit_offer below), on a follow-up after an
#                        inspection, only while the deposit has not been offered to them yet
#   {new_thing}          on a follow-up to a quiet customer: the one thing they have not been
#                        offered yet, in this order: the export certificate and auction sheet, the
#                        walkaround video, a similar car we have, a time to come in (@new_... below)
#   {if_word}            for any fact above: keeps its paragraph only when that fact applies, such
#                        as {if_car_link} for a heading over the car's link
#   [CAPITALS?]          a blank only you can fill in; the page highlights it
#
# The AI fits the message to the customer and what they last wrote. Every fact, link, figure and
# blank above stays exactly as Wheelman put it in. Your Prompt changes the wording as you say.
#
# The lines below are the pieces the follow-up messages are built from. "\n" is a line break.
@deposit_offer: A $1,000 refundable holding deposit takes it off the market for you; until then it stays for sale.
@new_documents: We can send you the export certificate, which carries the odometer history, and the auction sheet:\n{documents}
@new_video: There is a walkaround video of it here:\n{video_link}
@new_similar: We also have a {similar_car} at {similar_price} with {similar_km}, if that is of interest:\n{similar_link}
@new_visit: You are welcome to come and see it any day between 8 am and 5 pm. You can book a time here:\n{booking_link}

===== first_reply =====
@label: First reply: the car
@fits: first reply
@needs: car
@not: buyer, car sold
{greeting}

Thank you for your enquiry about the {car}.

It is {where}.

{first_reply_block}

===== still_available =====
@label: Still available
@fits: availability, vehicle_details, general
@needs: car available
@not: car sold, buyer
{greeting}

Yes, the {car} is still available. It is {where}, with {km} on the odometer.

{if_inclusions}The price of {price} includes {inclusions}.

{if_car_link}Vehicle details:
{car_link}

{invitation}

{sign_off}

===== car_sold =====
@label: Car sold: our other cars
@fits: availability, inspection_booking, price_negotiation, vehicle_details, general
@needs: car sold
@not: buyer
{greeting}

Thank you for your interest in the {car}. It has now been sold.

You can see the cars we have available now here:
{stock_link}

If you let us know the year, kilometres and budget you have in mind, we can also find one for you at auction in Japan.

{sign_off}

===== price_question =====
@label: Price question
@fits: price_negotiation
@needs: car
@not: car sold, buyer, their offer
{greeting}

Thank you for your interest in the {car}.

{price_reply}

{sign_off}

===== their_offer =====
@label: Their offer
@fits: price_negotiation
@needs: car, their offer
@not: car sold, buyer
{greeting}

Thank you for your offer on the {car}. Regarding your offer, [PRICE?].

{price_reply}

{sign_off}

===== book_inspection =====
@label: Book an inspection
@fits: inspection_booking, location_hours
@needs: car available
@not: far away, buyer
{greeting}

You are very welcome to come and see the {car} at our Lidcombe showroom.

{invitation}

{sign_off}

===== video_inspection =====
@label: Online video inspection
@fits: inspection_booking, delivery_interstate, far away
@needs: car available, far away
@not: buyer
{greeting}

As you are not close to Sydney, we can show you the {car} on a live video call, on WhatsApp or FaceTime, and answer your questions as we walk around it.

{invitation}

{sign_off}

===== car_on_its_way =====
@label: Not at the showroom yet
@fits: inspection_booking, availability, vehicle_details
@needs: car on its way
@not: buyer
{greeting}

The {car} is {where}, so it cannot be inspected or test driven yet.

{if_car_link}You can see its photos and details here:
{car_link}

We will let you know as soon as it is ready to see at our Lidcombe showroom.

{sign_off}

===== finance =====
@label: Finance
@fits: finance
@not: buyer
{greeting}

Yes, we can help with finance through our lending partners. You can apply here:
{finance_link}

Starting an application uses a soft credit check that does not affect your credit score, and our finance partner will contact you about the approval, rate and terms.

{sign_off}

===== trade_in =====
@label: Trade-in
@fits: trade_in
@not: buyer
{greeting}

Yes, we accept trade-ins against a car from our stock. To value yours, please send us its rego number and state, the odometer reading, its condition and any defects, and a few clear photos.

Any value we give is subject to inspection.

{sign_off}

===== hold_deposit =====
@label: Hold it with a deposit
@fits: deposit_hold
@needs: car
@not: car sold, buyer
{greeting}

Thank you. A $1,000 refundable holding deposit takes the {car} off the market for you.

To prepare the invoice, please send us your driver licence details and your email address. The invoice comes by email with our payment details.

{sign_off}

===== delivery =====
@label: Delivery interstate
@fits: delivery_interstate
@not: buyer
{greeting}

Yes, we deliver Australia-wide by car carrier, to your door or to a depot. Delivery within Greater Sydney is included; for anywhere else, please send us your suburb and postcode and we will get you a quote.

{sign_off}

===== history =====
@label: History and kilometres
@fits: history_kms, vehicle_details
@needs: car
@not: car sold, buyer
{greeting}

The {car} was imported from Japan. Its Japanese export certificate records the odometer history with dates, which is how the kilometres are verified, and we can share it with the auction sheet.

{if_car_link}Vehicle details:
{car_link}

{sign_off}

===== registration =====
@label: Registration and roadworthy
@fits: rego_roadworthy
@needs: car
@not: car sold, buyer
{greeting}

{if_inclusions}The {car} comes with {inclusions}.

It is registered in our dealership's name first, and you transfer it into yours with the signed Form 5 sales contract.

{sign_off}

===== warranty =====
@label: Warranty
@fits: warranty
@needs: car
@not: car sold, buyer
{greeting}

{if_warranty}Yes, the {car} comes with a 5-year extended warranty by Integrity Car Care, valid Australia-wide. It covers mechanical and electrical parts and the hybrid battery, with 1 year of roadside assistance.

{if_no_warranty}The 5-year extended warranty by Integrity Car Care can be added to the {car} for $1,300. It covers mechanical and electrical parts and the hybrid battery, with 1 year of roadside assistance.

Full details:
{warranty_link}

{sign_off}

===== photos_video =====
@label: Photos and video
@fits: photos_video, vehicle_details
@needs: car
@not: car sold, buyer
{greeting}

{if_car_link}You can see all the photos and videos of the {car} on its page:
{car_link}

We are also happy to show it to you on a live video call.

{sign_off}

===== where_and_when =====
@label: Where and when we are open
@fits: location_hours, any
@not: buyer
{greeting}

You are very welcome to visit us at our Lidcombe showroom.

{address_block}

===== import_interest =====
@label: Import from Japan
@fits: import_sourcing
@not: buyer
{greeting}

We can find one for you at auction in Japan. So we can search for the right one, please let us know the year range, the maximum kilometres and the landed budget you have in mind.

How importing works:
{importing_link}

{sign_off}

===== polite_close =====
@label: Polite close
@fits: parting
{greeting}

Thank you for letting us know. If you are looking again in future, we would be glad to help.

{sign_off}

# A booking that has just come in through the website: confirmed by code, word for word.
===== booking_confirmed =====
@label: Booking confirmed
@fits: booking made, inspection_booking
@not: buyer, car sold
@fit: no
{greeting}

Team Carbarn here. Your {booking_kind} of the {car} is booked for {booked_when} at {booked_time}.

{if_onsite}We are at {address}. If the time no longer suits, let us know and we will find another.

{if_online}We will call you at that time on this number and walk you around the car on video.

{sign_off}

# The follow-ups: offered only from the Follow-ups list, and always greeted and signed off, even
# when we have already written that day. Never ask whether they came: ask how it went.
===== after_inspection =====
@label: After the inspection
@fits: inspection passed
@not: buyer, car sold
{greeting}

Team Carbarn here. How did you find the {car} {booked_day}?

{deposit_offer}

{sign_off}

===== quiet_nudge =====
@label: Follow-up: one new thing
@fits: quiet
@not: buyer, car sold
{greeting}

Team Carbarn here, following on from the {car}.

{new_thing}

{sign_off}

# The afternoon before a booked visit: written by code, word for word, with the address.
===== inspection_reminder =====
@label: Inspection reminder
@fits: reminder
@not: buyer, car sold
@fit: no
{greeting}

Team Carbarn here. A reminder of your {booking_kind} of the {car} {booked_when} at {booked_time}.

{if_onsite}We are at {address}. If the time no longer suits, let us know and we will find another.

{if_online}We will call you at that time on this number and walk you around the car on video.

{sign_off}
