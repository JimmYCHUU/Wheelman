# The message that offers a customer a car found in the live Japan auction
#
# Used in two places: a reply to an import enquiry in the Dashboard section, and "Car found,
# full" in the Auction section. The first lines (the greeting, and which car was found) come
# before it. Everything below is then added exactly as written here, with the figures filled in
# from the live auction and the website's landed-cost calculator. Lines starting with # are
# notes and are never sent. Edit the rest freely.
#
#   {vehicle_lines}  the car: name, kilometres, auction grade, engine, drive, seats (one per line)
#   {lot_url}        the car's page in the live auction
#   {bid_sentence}   one of the three sentences marked @ below
#   {bid}            the bid in yen, such as ¥350,000
#   {website_bid}    the website's own suggested bid for the car
#   {total}          the estimated landed and complied cost, such as $11,572
#   {cost_lines}     the parts of that cost, one per line
#   {if_deposit}     keeps its paragraph only while the customer has not paid a deposit
#   {sender}         the name on the last line (FIRST_REPLY_SENDER in the .env file)
#
# The bid we suggest is worked out from what similar cars sold for: the average of the three
# closest sold cars on the website's "Japan auction sold prices" list, rounded up. It is never
# below the website's own suggested bid: when similar cars sold for less, that bid is rounded up.
#
# [DEPOSIT LINK?] is left as a blank on purpose: you paste the customer's deposit link there.

# When our bid is higher than the website's, both are named:
@suggested_both: The website's suggested bid is {website_bid}. We usually suggest around {bid} to improve the chance of winning. However, if you have your own preferred bid amount, please let us know and we can proceed with that amount.
# When the website gives no suggested bid, ours is the same, or you typed in a lower bid yourself:
@suggested: For this vehicle, we would suggest a bid of around {bid} for a stronger winning chance. However, if you have your own preferred bid amount, please let us know and we can proceed with that amount.
# When the customer named the bid:
@own: This is based on your own bid of {bid}. If you would like to change the bid amount, please let us know and we can proceed with that amount.

Vehicle details:
{vehicle_lines}

You can view the vehicle and photos here:
{lot_url}

{bid_sentence}

Based on a {bid} bid, the current estimated landed and complied cost is approximately AUD {total}, including:

{cost_lines}

{if_deposit}If you would like us to proceed, you can use the deposit link below:
[DEPOSIT LINK?]

We do not bid blindly. Our Japan-side team will inspect the vehicle first and share the photos, auction sheet and inspection feedback. We will only place the final bid once you are happy and confirm us to proceed.

Kind regards,
{sender}
