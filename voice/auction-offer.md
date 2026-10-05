# The reply that offers a customer a car found in the live Japan auction
#
# Wheelman writes the first lines (the greeting, and which car was found and why it may suit).
# Everything below is then added exactly as written here, with the figures filled in from the
# live auction and the website's landed-cost calculator. Lines starting with # are notes and
# are never sent. Edit the rest freely.
#
#   {vehicle_lines}  the car: name, kilometres, auction grade, engine, drive, seats (one per line)
#   {lot_url}        the car's page in the live auction
#   {bid_sentence}   one of the two sentences marked @suggested and @own below
#   {bid}            the bid in yen, such as ¥300,000
#   {total}          the estimated landed and complied cost, such as $11,019
#   {cost_lines}     the parts of that cost, one per line
#   {sender}         the name on the last line (FIRST_REPLY_SENDER in the .env file)
#
# [DEPOSIT LINK?] is left as a blank on purpose: you paste the customer's deposit link there.

@suggested: For this vehicle, we would suggest a bid of around {bid} for a stronger winning chance. However, if you have your own preferred bid amount, please let us know and we can proceed with that amount.
@own: This is based on your own bid of {bid}. If you would like to change the bid amount, please let us know and we can proceed with that amount.

Vehicle details:
{vehicle_lines}

You can view the vehicle and photos here:
{lot_url}

{bid_sentence}

Based on a {bid} bid, the current estimated landed and complied cost is approximately AUD {total}, including:

{cost_lines}

If you would like us to proceed, you can use the deposit link below:
[DEPOSIT LINK?]

We do not bid blindly. Our Japan-side team will inspect the vehicle first and share the photos, auction sheet and inspection feedback. We will only place the final bid once you are happy and confirm us to proceed.

Kind regards,
{sender}
