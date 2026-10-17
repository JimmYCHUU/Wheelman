# Import Query messages: the "Which message?" list for import enquiries by email
#
# The same kind of file as voice/dashboard-messages.md: one part per message, its details on the
# @ lines, its facts in curly brackets. Emails are always greeted and signed.
#
# What an email can show (for @fits, @needs and @not): what they asked about (eligibility, cost,
# deposit, timeline, payment, warranty, compliance_only, process, availability), eligible (the
# model they asked about is on our website's eligible list), first reply, later reply, and any
# (always offered).
#
# Facts, from what was looked up on our website for the model they asked about:
#   {greeting}          Hello and their name
#   {sign_off}          Regards, Team Carbarn
#   {model}             the model, such as Toyota Hiace GDH206; a blank when none was found
#   {model_page}        its page on our website, with the build range and the compliance details
#   {year_range}        the approved build range
#   {landed_cost}       the estimated landed and complied cost; a blank when there is none
#   {deposit}           the refundable deposit to start the search; a blank when there is none
#   {if_eligible}       keeps its paragraph only when the model is on our eligible list
#   {if_not_listed}     keeps its paragraph only when they named a model code that is not on it
#   {importing_link} {eligible_link}   how importing works, and every eligible model
#   [CAPITALS?]         a blank only you can fill in; the page highlights it

===== eligible_cost =====
@label: Eligible: landed cost and deposit
@fits: eligibility, cost, deposit, availability, first reply
{greeting}

Thank you for your enquiry.

{if_eligible}Yes, we can import the {model} for you. It is on the list of vehicles eligible for import to Australia, for builds in {year_range}.

{if_eligible}Based on recent auction prices, the estimated landed and complied cost is {landed_cost}, and the refundable deposit to start the search is {deposit}.

{if_eligible}More about this model:
{model_page}

{if_not_listed}The model you mentioned is not on our list of vehicles eligible for import to Australia. You can see every eligible model here:
{eligible_link}

Before we bid, our team in Japan inspects the car and sends you the auction sheet and photos, and we only bid with your approval.

{sign_off}

===== process =====
@label: How it works and how long it takes
@fits: process, timeline, payment, compliance_only, any
{greeting}

Thank you for your enquiry.

We source the car at auction in Japan. Before we bid, our team there inspects it and sends you the auction sheet and photos, and we only bid with your approval. Once it is secured, it is shipped, complied and registered: about 6 to 10 weeks in all.

The search starts with a refundable deposit, which goes towards the car once we secure one for you.

How importing works:
{importing_link}

{sign_off}

===== ready_to_search =====
@label: Ready to search
@fits: eligibility, cost, availability, later reply
@needs: eligible
{greeting}

Thank you for the details. We will search the coming auctions for a {model} that matches what you are after, and send you the best ones with their auction sheets and photos before anything is placed.

To start the search, we ask for a refundable deposit of {deposit}. [DEPOSIT LINK?]

{sign_off}
