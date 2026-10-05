# The first reply to an import or auction enquiry
#
# Used when a customer asks us to find a car from Japan and has not yet told us what they are
# looking for. Lines starting with # are notes and are never sent. Edit the rest freely.
#
# The part above the line of dashes is the message. It is used as written when the customer
# only filled in the website form. When they also wrote something of their own, Wheelman writes
# the message so it can answer them, and still ends with the part below the dashes.
#
#   {{NAME}}   the customer's first name. "Hi {{NAME}}," becomes "Hi," when no name is known.
#   {car}      the car they enquired about, such as "Subaru XV Hybrid"
#   {details}  the things we still need to know, such as "your preferred year range, maximum odometer, ..."
#   {sender}   the name on the last line (FIRST_REPLY_SENDER in the .env file; "Team Carbarn" when not set)

Hi {{NAME}}, thanks for your {car} enquiry.

To help us narrow down the right car from Japan auctions, could you please let us know {details}?

If you’re interested in a particular one that comes up, you can also send us your target bid or overall budget and we can work out an estimated landed cost before placing anything.

Once we have those details, we can keep the search focused and let you know when a suitable one becomes available.

---

📍 Unit D3, 128-130 Frances Street, Lidcombe NSW 2141
📞 0423 840 130
🕛 Open 7 days, 8 AM–5 PM

Regards,
{sender}
