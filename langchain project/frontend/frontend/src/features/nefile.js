# services/scoring_engine.py
# Port from Rushil_MSME_MIS_v5_with_MFOS_Scoring.xlsx

COMPONENT_WEIGHTS = {
    "banking_discipline": 0.25,
    "liquidity_ratios": 0.15,
    "gst_consistency": 0.15,
    "leverage_quality": 0.10,
    "profitability": 0.10,
    "compliance_discipline": 0.10,
    "documentation_readiness": 0.10,
    "repayment_behavior": 0.05,
}

def score_banking_discipline(bounces_per_month: float, avg_balance: float, cibil: int) -> float:
    # 0-100 sub-score
    bounce_score = max(0, 100 - (bounces_per_month * 20))
    cibil_score = min(100, max(0, (cibil - 600) / 2))
    return (bounce_score * 0.6) + (cibil_score * 0.4)

def score_liquidity(current_ratio: float, wc_cycle_days: float) -> float:
    cr_score = 100 if current_ratio >= 1.5 else (75 if current_ratio >= 1.33 else (40 if current_ratio >= 1.0 else 0))
    cycle_score = 100 if wc_cycle_days <= 60 else (70 if wc_cycle_days <= 90 else (40 if wc_cycle_days <= 120 else 0))
    return (cr_score * 0.6) + (cycle_score * 0.4)

def compute_composite_score(components: dict) -> dict:
    health_score = sum(
        components[key] * COMPONENT_WEIGHTS[key]
        for key in COMPONENT_WEIGHTS
    )
    
    # Band classification per spec
    if health_score >= 80:
        band, lender = "A", "PSU Bank @ 9.0-10.5%"
    elif health_score >= 60:
        band, lender = "B", "PSU with conditions / Private Bank"
    elif health_score >= 40:
        band, lender = "C", "NBFC bridge + 12-month migration plan"
    else:
        band, lender = "D", "NBFC only / rebuild"

    return {
        "health_score": round(health_score, 1),
        "band": band,
        "recommended_lender_tier": lender,
        "component_breakdown": components
    }


---

# routers/ai.py
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser

llm = ChatAnthropic(model="claude-sonnet-4-6", max_tokens=1000)

briefing_prompt = ChatPromptTemplate.from_template("""
You are an MFOS CFO advisor writing a daily briefing for an MSME owner.
Write exactly 3 action items in plain Tamil-friendly English (no jargon).

MSME Data:
- Score: {health_score}/100 (Band {band})
- Top overdue debtor: {top_debtor_name} — ₹{top_debtor_amount}L ({top_debtor_days} days)
- Next EMI: ₹{next_emi_amount}L due {next_emi_date} ({next_emi_bank})
- GST due in: {gst_days_remaining} days — ₹{gst_amount}L payable

Return JSON only: {{"actions": ["action1", "action2", "action3"]}}
""")

briefing_chain = briefing_prompt | llm | JsonOutputParser()

@router.post("/ai/daily-briefing/{msme_id}")
async def generate_daily_briefing(
    msme_id: str,
    user: dict = Depends(verify_supabase_token)
):
    # Fetch MSME data from Supabase
    msme_data = supabase.table("msme_entities").select("*").eq("id", msme_id).single().execute()
    
    result = await briefing_chain.ainvoke({
        "health_score": msme_data.data["health_score"],
        # ... map fields
    })
    
    # Save to Supabase for mobile app to read
    supabase.table("daily_briefings").insert({
        "msme_id": msme_id,
        "actions": result["actions"],
        "generated_at": "now()"
    }).execute()
    
    return result


----

dockerfile

FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

---

Requirement.txt

# Keep
fastapi==0.111.0
uvicorn==0.30.0
pydantic==2.7.0

# Replace SQLAlchemy/SQLite with:
supabase==2.4.0
python-jose[cryptography]==3.3.0   # JWT verification

# Add AI layer
langchain==0.2.0
langchain-anthropic==0.1.15
anthropic==0.28.0

# Add document processing
pdfplumber==0.11.0
weasyprint==62.3
python-docx==1.1.2
openpyxl==3.1.4

# Add scheduling
apscheduler==3.10.4

# Add utilities
python-dotenv==1.0.1
httpx==0.27.0