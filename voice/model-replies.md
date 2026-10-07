# Model replies

Invented customers, invented cars, replies in the house voice. Each one sets the standard for
messages like it once the owner has marked it Good reply on the page (under Standards). Edit any
reply here freely; the page keeps each one's status beside this file in model-replies.json.

Every scenario is a `## <number>. <title>` block with these lines, then `Customer:` and `Reply:`:

    Situation: the situation ids, main one first (see src/situations.js)
    Rung: interest | proof | fit | commit | buyer
    Channel: sms | marketplace
    Vehicle: MR1 to MR8 (the invented cars in src/modelreplies.js)
    Name: the invented customer's first name
    State: NSW unless the customer is interstate
    Buyer: yes, for someone who has already paid a deposit

Earlier messages, oldest first, may come before `Customer:` as `US:`, `CUSTOMER:` and `EVENT:`
lines. A reply may use `{{NAME}}`, and the placeholders `{vehicle_url}`, `{onsite_link}` and
`{online_link}` for the invented car's own links.

A first reply (no earlier `US:` line, SMS) gets the standard block under it automatically, so it
never writes the address, the hours, a phone number or a link. The invented cars:

- MR1: 2021 Toyota Noah X (8 Seater), $28,900, 62,733 km, 8 seats, 6 months rego, 5-year warranty, Sydney delivery, at the yard
- MR2: 2020 Toyota Hiace DX van, $33,900, 98,000 km, diesel, 3 seats, 6 months rego, Sydney delivery, at the yard
- MR3: 2018 Toyota Alphard S, $45,900, 88,000 km, 7 seats, 2 keys, 3-month dealer warranty and 5-year warranty, at the yard
- MR4: 2019 Honda N-Box Custom, $19,900, 41,000 km, 2 keys, 5-year warranty, at the yard
- MR5: 2016 Nissan Serena Highway Star, $19,900, 101,000 km, 8 seats, at the yard
- MR6: 2017 Toyota Prius S, $18,900, 71,000 km, hybrid, on the way to Australia
- MR7: 2019 Mazda CX-8 Sport, sold
- MR8: 2022 Toyota Corolla Touring Hybrid, $29,900, 35,000 km, still in Japan

## 1. Is it still available
Situation: availability
Rung: interest
Channel: sms
Vehicle: MR1
Name: Priya
Customer:
Hi, is the Noah still available?
Reply:
Hi {{NAME}},
Yes, the 2021 Noah is here at Lidcombe. It has done 62,733 km, with the auction sheet and export certificate to match.
You are welcome to come and see it any day. Would a weekday after work or Saturday morning suit you?

## 2. Seats and keys
Situation: vehicle_details
Rung: interest
Channel: sms
Vehicle: MR1
Name: Tom
Customer:
Does the Noah have 8 seats and how many keys does it come with?
Reply:
Hi {{NAME}},
Yes, the Noah is the 8 seater, with both sliding doors. It comes with 1 key.
You are welcome to come and sit in it any day. Would a weekday after work or Saturday morning suit you?

## 3. Best price, first message
Situation: price_negotiation
Rung: fit
Channel: sms
Vehicle: MR2
Name: Isla
Customer:
What's your best price on the Hiace?
Reply:
Hi {{NAME}},
The price includes 6 months NSW rego, a fresh blue slip, CTP, a full service and delivery within Greater Sydney. Government charges are extra.
We talk price once you have seen the van. Are you paying cash, or going through finance?

## 4. History and the auction sheet
Situation: history_kms
Rung: proof
Channel: sms
Vehicle: MR3
Name: Kofi
Customer:
What's the history on the Alphard? Any accident history? Can I see the auction sheet?
Reply:
Hi {{NAME}},
Happy to send both. The Alphard is grade 4.5 on the auction sheet, and the export certificate shows the odometer history with dates.
Your own mechanic is welcome to look it over here. Would you like the documents sent through?

## 5. Finance and repayments
Situation: finance
Rung: fit
Channel: sms
Vehicle: MR4
Name: Yuki
Customer:
Do you do finance on the N-Box? What would the repayments be?
Reply:
Hi {{NAME}},
Yes, finance is through our lenders. The application is on the N-Box page, takes a few minutes, and starts with a soft check that does not affect your credit score. Our finance partner then calls you with the figures.

## 6. Trade-in offered
Situation: trade_in
Rung: fit
Channel: sms
Vehicle: MR5
Name: Maria
Customer:
I have a 2014 Camry to trade in on the Serena, is that possible?
Reply:
Hi {{NAME}},
Yes, we take trade-ins against a car from our stock. To have a figure ready before you come, we need the rego number and state, the kilometres, the condition and a few clear photos.
Could you send those through?

## 7. Interstate, first message
Situation: delivery_interstate
Rung: fit
Channel: sms
Vehicle: MR1
Name: Nina
State: QLD
Customer:
I'm in Brisbane so can't get down. Do you deliver the Noah?
Reply:
Hi {{NAME}},
We do. Most of our interstate buyers do a live video inspection on WhatsApp or FaceTime first, then we send the car up by car carrier.
What is your postcode, so we can quote the delivery?

## 8. Wants to see it tomorrow
Situation: inspection_booking
Rung: interest
Channel: sms
Vehicle: MR2
Name: Remy
Customer:
Can I come and see the Hiace tomorrow afternoon?
Reply:
Hi {{NAME}},
Tomorrow afternoon is fine, the Hiace is here at Lidcombe. Book a time that suits and it will be out the front, washed and ready for a test drive.

## 9. Where are you
Situation: location_hours
Rung: interest
Channel: sms
Vehicle: MR3
Name: Dana
Customer:
Where are you located and are you open on Sunday?
Reply:
Hi {{NAME}},
We are in Lidcombe and open every day, Sunday included. The Alphard is here, so come any time that suits and have a look.

## 10. Warranty
Situation: warranty
Rung: fit
Channel: sms
Vehicle: MR3
Name: Eli
Customer:
Does the Alphard come with any warranty?
Reply:
Hi {{NAME}},
Yes. The Alphard comes with the 3-month dealer warranty and the 5-year extended warranty, which covers mechanical and electrical parts Australia-wide.
It is here at Lidcombe whenever you would like to see it. Would a weekday after work or Saturday morning suit?

## 11. Rego and stamp duty
Situation: rego_roadworthy
Rung: fit
Channel: sms
Vehicle: MR1
Name: Rhea
Customer:
Does the price include rego and a blue slip? What about stamp duty?
Reply:
Hi {{NAME}},
Yes, the price includes 6 months NSW rego, a fresh blue slip and CTP. Stamp duty and the transfer fee are paid to Service NSW when the car goes into your name.
Come and see it any day, it is here at Lidcombe.

## 12. More photos
Situation: photos_video
Rung: proof
Channel: sms
Vehicle: MR5
Name: Liam
Customer:
Can you send me more photos of the Serena, especially the interior?
Reply:
Hi {{NAME}},
Happy to. We will send interior photos and a walkaround video shortly, and the auction sheet with them so you can see how it was graded.
It is here at Lidcombe if you would like to see it in person.

## 13. Not here yet
Situation: availability
Rung: interest
Channel: sms
Vehicle: MR6
Name: Ava
Customer:
Is the Prius available to see this week?
Reply:
Hi {{NAME}},
The Prius is on its way to Australia, so it cannot be seen this week. You can reserve it now with a $1,000 refundable holding deposit and test drive it when it lands.
We will let you know as soon as it arrives.

## 14. Sold
Situation: availability
Rung: interest
Channel: sms
Vehicle: MR7
Name: Kofi
Customer:
Is the CX-8 still available?
Reply:
Hi {{NAME}},
Unfortunately, the CX-8 has been sold.
We have other 7 seaters in stock and can let you know when a similar one lands. Is it the seats or the diesel that matters most to you?

## 15. Just interested
Situation: general
Rung: interest
Channel: sms
Vehicle: MR3
Name: Tom
Customer:
Hi, interested in the Alphard.
Reply:
Hi {{NAME}},
The Alphard is here at Lidcombe: 88,000 km, 7 seats, grade 4.5, and it comes with the 5-year warranty.
You are welcome to come and see it any day. Would a weekday after work or Saturday morning suit you?

## 16. An offer by text
Situation: price_negotiation
Rung: fit
Channel: sms
Vehicle: MR2
Name: Isla
CUSTOMER: Is the Hiace still available?
US: Hi Isla, yes, the Hiace is here at Lidcombe. You are welcome to come and see it any day.
Customer:
Can you do $31,000?
Reply:
Hi {{NAME}},
We talk price once you have seen the van, so come and have a look first.
It comes with 6 months rego, a fresh blue slip, CTP, a full service and delivery within Greater Sydney. Would a weekday after work or Saturday morning suit you?

## 17. Hold it for me
Situation: deposit_hold
Rung: commit
Channel: sms
Vehicle: MR1
Name: Priya
CUSTOMER: Is the Noah still available?
US: Hi Priya, yes, the Noah is here at Lidcombe. You are welcome to come and see it any day.
Customer:
Can you hold it for me until Saturday?
Reply:
Hi {{NAME}},
We hold a car with a $1,000 refundable holding deposit, which takes it off the market for you. Until then it stays for sale.
To send the invoice we need a photo of your driver licence and your email address. Would you like to secure it?

## 18. Inspection booked
Situation: inspection_booking
Rung: commit
Channel: sms
Vehicle: MR5
Name: Kofi
CUSTOMER: Can I come and see the Serena on Saturday?
US: Hi Kofi, Saturday is fine. Here is the booking link so you can pick a time: {onsite_link}
EVENT: Customer booked an inspection through the website: Saturday 10:00 am
Customer:
Booked for Saturday at 10, see you then.
Reply:
Hi {{NAME}},
See you Saturday at 10, the Serena will be out the front for you.
One thing worth knowing: until a deposit is paid the car stays for sale. If it checks out on the day, a $1,000 refundable holding deposit takes it off the market for you.

## 19. After the visit
Situation: general
Rung: commit
Channel: sms
Vehicle: MR3
Name: Maria
CUSTOMER: Can we come Saturday at 10?
US: Hi Maria, see you Saturday at 10. The Alphard will be out the front for you.
Customer:
Thanks, we had a look today and really liked it. What's next?
Reply:
Hi {{NAME}},
Glad it was what you hoped. The next step is a $1,000 refundable holding deposit, which takes the Alphard off the market for you.
Send a photo of your driver licence and your email address and the invoice follows by email. Would you like to go ahead?

## 20. Thinking about it
Situation: general
Rung: fit
Channel: sms
Vehicle: MR1
Name: Yuki
CUSTOMER: What's included in the price?
US: Hi Yuki, the price includes 6 months rego, a fresh blue slip, CTP, a full service and the 5-year warranty. Government charges are extra.
Customer:
Thanks, I'll think about it and get back to you.
Reply:
Hi {{NAME}},
No worries, it is a big buy.
If it helps to know: the deposit is refundable, the warranty is 5 years, and you are welcome to bring your own mechanic. Is it the car itself, or the money side?

## 21. Finance application started
Situation: finance
Rung: commit
Channel: sms
Vehicle: MR4
Name: Nina
CUSTOMER: Do you do finance?
US: Hi Nina, yes, through our lenders. The application is on the N-Box page and takes a few minutes.
EVENT: Customer submitted a finance application through the website.
Customer:
I've put the finance application in, what happens now?
Reply:
Hi {{NAME}},
Our finance partner will contact you about the application. While that happens, a $1,000 refundable holding deposit takes the N-Box off the market for you, and it is refunded once the lender pays.
Would you like to secure it in the meantime?

## 22. Turns out to be far away
Situation: delivery_interstate inspection_booking
Rung: proof
Channel: sms
Vehicle: MR1
Name: Remy
State: VIC
CUSTOMER: Can I come and see the Noah?
US: Hi Remy, of course. Here is the booking link: {onsite_link}
Customer:
Actually I'm in Melbourne so can't come up. Any other way to see it?
Reply:
Hi {{NAME}},
No worries. Most of our interstate buyers do a live video inspection on WhatsApp or FaceTime, where we walk around the car with you, and then we send it down by car carrier.
Book a time here: {online_link}
What is your postcode, so we can quote the delivery?

## 23. Kilometres seem high
Situation: history_kms price_negotiation
Rung: proof
Channel: sms
Vehicle: MR5
Name: Eli
CUSTOMER: Is the Serena available?
US: Hi Eli, yes, the Serena is here at Lidcombe. You are welcome to come and see it any day.
Customer:
101,000 km seems a lot for the price.
Reply:
Hi {{NAME}},
Fair point. The kilometres are verified on the export certificate, which records the odometer with dates, and the car has had a full service. You are welcome to bring your own mechanic.
Would you like the export certificate and the auction sheet sent through?

## 24. No logbooks
Situation: history_kms
Rung: proof
Channel: sms
Vehicle: MR3
Name: Dana
CUSTOMER: Is the Alphard available?
US: Hi Dana, yes, it is here at Lidcombe. You are welcome to come and see it.
Customer:
Why is there no logbook or service history?
Reply:
Hi {{NAME}},
Cars from Japan rarely come with logbooks. In their place we have the auction sheet, which grades the car, and the export certificate, which records the odometer history with dates. Every car is serviced and detailed before sale.
Would you like both sent through?

## 25. Cash discount
Situation: price_negotiation
Rung: fit
Channel: sms
Vehicle: MR4
Name: Liam
CUSTOMER: Is the N-Box available?
US: Hi Liam, yes, it is here at Lidcombe.
Customer:
Is the price negotiable if I pay cash?
Reply:
Hi {{NAME}},
We prefer bank transfer, and we talk price once you have seen the car. It comes with 6 months rego, a fresh blue slip, CTP, a full service and the 5-year warranty.
Would a weekday after work or Saturday morning suit you?

## 26. Interstate rego
Situation: rego_roadworthy delivery_interstate
Rung: fit
Channel: sms
Vehicle: MR1
Name: Ava
State: QLD
CUSTOMER: Do you deliver to Queensland?
US: Hi Ava, yes, Australia-wide by car carrier.
Customer:
I'm in Queensland, how does rego work if I buy?
Reply:
Hi {{NAME}},
We register the car in NSW. You drive on the NSW rego with the sales contract, then transfer it in Queensland and pay their stamp duty and transfer fee at that point.
Would you like to book a live video inspection first?

## 27. Documents, please
Situation: history_kms
Rung: commit
Channel: sms
Vehicle: MR2
Name: Kofi
CUSTOMER: Is the Hiace still available?
US: Hi Kofi, yes, the Hiace is here at Lidcombe.
CUSTOMER: Can I come Saturday?
US: Hi Kofi, see you Saturday. It will be out the front.
Customer:
Can you send the auction sheet and export certificate before Saturday?
Reply:
Hi {{NAME}},
Of course, happy to send both. The export certificate shows the odometer history with dates.
If it checks out on Saturday, a $1,000 refundable holding deposit takes the van off the market for you; until then it stays for sale.

## 28. How do I pay the deposit
Situation: deposit_hold
Rung: commit
Channel: sms
Vehicle: MR1
Name: Priya
CUSTOMER: Can you hold the Noah for me?
US: Hi Priya, we hold a car with a $1,000 refundable holding deposit. To send the invoice we need a photo of your driver licence and your email address.
Customer:
Great. How do I pay the deposit?
Reply:
Hi {{NAME}},
Send a photo of your driver licence and your email address, and we will email the invoice with the bank details. The deposit is paid by bank transfer, and a screenshot of the payment confirms it on our side.

## 29. Already a buyer
Situation: after_sale
Rung: buyer
Channel: sms
Vehicle: MR1
Name: Tom
Buyer: yes
CUSTOMER: Deposit paid, thanks.
US: Hi Tom, received, thank you. The Noah is now registered in our name and being prepared.
Customer:
When will the car be ready to pick up?
Reply:
Hi {{NAME}},
We are finishing the roadworthy, the service and the detail now, and the pickup day is confirmed with you as soon as the roadworthy is done.
Once it is registered you get the rego number and VIN, so you can arrange insurance before pickup.

## 30. Found another car
Situation: general
Rung: interest
Channel: sms
Vehicle: MR5
Name: Isla
CUSTOMER: Is the Serena available?
US: Hi Isla, yes, the Serena is here at Lidcombe. You are welcome to come and see it any day.
Customer:
Thanks but I've found another car, I'll pass.
Reply:
Hi {{NAME}},
No worries, thank you for letting us know, and enjoy the new car.

## 31. Come Saturday morning
Situation: inspection_booking
Rung: interest
Channel: sms
Vehicle: MR3
Name: Rhea
CUSTOMER: Is the Alphard available?
US: Hi Rhea, yes, it is here at Lidcombe.
Customer:
Can I come Saturday morning to see it?
Reply:
Hi {{NAME}},
Saturday morning is fine. Book a time here so it is out the front for you: {onsite_link}
Please text before you set off, and bring your licence if you would like to drive it.

## 32. Marketplace: still available
Situation: availability
Rung: interest
Channel: marketplace
Vehicle: MR4
Name: Yuki
Customer:
Is this still available?
Reply:
Yes, the N-Box is here at Lidcombe, 41,000 km with the auction sheet to match. Happy to send the walkaround video, or you are welcome to come and see it any day.

## 33. Marketplace: best price
Situation: price_negotiation
Rung: fit
Channel: marketplace
Vehicle: MR2
Name: Remy
Customer:
Best price?
Reply:
The price includes 6 months rego, a fresh blue slip, CTP, a full service and delivery within Sydney. We talk price once you have seen the van. Cash or finance?

## 34. Marketplace: come tomorrow
Situation: inspection_booking
Rung: interest
Channel: marketplace
Vehicle: MR1
Name: Nina
Customer:
Can I come see it tomorrow?
Reply:
Yes, tomorrow is fine. Book a time here and it will be out the front for you: {onsite_link}

## 35. Marketplace: far away
Situation: delivery_interstate inspection_booking
Rung: proof
Channel: marketplace
Vehicle: MR3
Name: Dana
Customer:
I'm in Newcastle, can you do a video call so I can see it?
Reply:
Yes, we do live video inspections on WhatsApp or FaceTime and deliver by car carrier. Book a time here: {online_link}

## 36. Marketplace: accident history
Situation: history_kms
Rung: proof
Channel: marketplace
Vehicle: MR5
Name: Liam
Customer:
Any accident history? Why so cheap?
Reply:
It is a Japanese import, grade 3.5 on the auction sheet, and we can send that and the export certificate with the odometer history. Your own mechanic is welcome to look it over here.

## 37. Marketplace: swap
Situation: trade_in
Rung: fit
Channel: marketplace
Vehicle: MR1
Name: Eli
Customer:
Would you swap for my Hilux?
Reply:
We take trade-ins against our stock rather than straight swaps. Send the rego, the kms and a few photos and we will have a figure ready before you come in.
