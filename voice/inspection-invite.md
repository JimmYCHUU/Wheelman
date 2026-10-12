# The invitation to inspect, in the owner's words (12 October 2026). Code adds it under a reply
# whenever the customer wants to see the car: inside the first-reply block, inside the price reply,
# and on its own under a later reply. The AI never writes it, and never proposes a time slot.
#
# Lines starting with # are notes and are never sent. Edit the rest freely.
#   @onsite / @online   the first line: for the in-person booking link, or the online video inspection link
#   @tail               the last line when nothing follows (the first-reply block says it already)
#   @tail_chat          the same on Facebook Marketplace, where a buyer messages rather than texts
#   {lead}              one of the first lines above, chosen by code
#   {inspection_url}    the booking link
@onsite: You can book an inspection here:
@online: You can book an online video inspection (a live video call on WhatsApp or FaceTime) here:
@tail: Please call or text before visiting.
@tail_chat: Please message or call before visiting.
{lead}
{inspection_url}
Or let us know your preferred date and time, and we'll arrange it for you.
