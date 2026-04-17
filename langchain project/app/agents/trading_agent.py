from app.core.mock_broker import MockBroker
from app.db.database import db_session 
from app.brokers.icici_breeze import ICICIBreezeClient

# Initialize it here so the node can use it
breeze_client = ICICIBreezeClient()
mock_broker = MockBroker(db_session, breeze_client)

def trading_node(state):
    signal = state.get('signal')
    trade_date = state.get('date')
    
    if signal == "Green":
        # Specific Bullish Action
        result = mock_broker.execute_dummy_sell(signal, trade_date, action="Sell Put")
        return {"messages": [f"Bullish Bias Detected: {result}"]}
    
    elif signal == "Red":
        # Specific Bearish Action
        result = mock_broker.execute_dummy_sell(signal, trade_date, action="Buy Put")
        return {"messages": [f"Bearish Bias Detected: {result}"]}
        
    return {"messages": ["Market Cycles suggest standing aside today."]}