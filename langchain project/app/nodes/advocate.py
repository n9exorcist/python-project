from __future__ import annotations

from langchain_core.messages import AIMessage


def advocate_node(state: "RationCardState") -> dict[str, list[AIMessage]]:
    ecd = state.get("ecd", 0)
    applicant_name = state.get("applicant_name", "Sir/Madam")
    ration_card_number = state.get("ration_card_number", "N/A")
    district = state.get("district", "the concerned district")

    if ecd > 30:
        content = f"""Subject: Grievance Regarding Delay in Ration Card Processing

Dear Sir/Madam,

I am writing to raise a grievance regarding the delay in processing my ration card application. My application has an elapsed processing time of {ecd} days, which exceeds the expected timeline.

Applicant Name: {applicant_name}
Ration Card Number: {ration_card_number}
District: {district}

I request that you review the status of my application and take the necessary action to expedite the process at the earliest.

Thank you for your attention to this matter.

Sincerely,
{applicant_name}"""
    else:
        content = (
            f"No grievance email was drafted because the elapsed processing time is "
            f"{ecd} days, which does not exceed the 30-day threshold."
        )

    return {"messages": [AIMessage(content=content)]}
