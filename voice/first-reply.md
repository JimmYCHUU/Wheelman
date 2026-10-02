# The standard first reply
#
# When Wheelman answers a brand-new enquiry it writes one or two opening lines that answer the
# customer's question, then adds everything below, exactly as written here.
#
# Lines starting with # are notes and are never sent. Edit the rest freely.
# Parts are separated by a blank line. Three placeholders can be used:
#   {vehicle_url}     the link to the car's page. If no car was matched, or it is sold or reserved,
#                     the whole part that contains it is left out.
#   {inspection_url}  the booking link for that car, when the customer asked to see it.
#                     Otherwise the whole part that contains it is left out.
#   {sender}          the name on the last line. Set FIRST_REPLY_SENDER in the .env file;
#                     it is "Team Carbarn" when not set.

Vehicle details:
{vehicle_url}

Book your inspection:
{inspection_url}

Our location:
📍 Unit D3, 128-130 Frances Street, Lidcombe NSW 2141

Google Maps:
https://maps.app.goo.gl/EQfdkTE7FYDF4DTT8

🕛 Open 7 days, 8 AM–5 PM.

Feel free to visit us or call
📞 0423 840 130
{sender}
