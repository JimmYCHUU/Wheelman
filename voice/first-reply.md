# The standard first reply
#
# When Wheelman answers a brand-new enquiry it writes one or two opening lines that answer the
# customer's question, then adds everything below, exactly as written here.
#
# Lines starting with # are notes and are never sent. Edit the rest freely.
# Parts are separated by a blank line. Placeholders:
#   {vehicle_url}        the link to the car's page. If no car was matched, or it is sold or reserved,
#                        the whole part that contains it is left out.
#   {inspection_invite}  the invitation to inspect, from voice/inspection-invite.md, with the booking
#                        link, when the customer asked to see the car. Otherwise left out.
#   {sender}             the name on the last line. Set FIRST_REPLY_SENDER in the .env file;
#                        it is "Team Carbarn" when not set.

Vehicle details:
{vehicle_url}

{inspection_invite}

Our location:
📍 136 Frances Street, Lidcombe NSW 2141

🕛 Open 7 days, 8 AM–5 PM.
Please call or text before visiting.

📞 0423 840 130
{sender}
