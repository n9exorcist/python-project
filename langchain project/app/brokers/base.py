from abc import ABC, abstractmethod

class BaseBroker(ABC):
    @abstractmethod
    def get_nifty_price(self) -> float:
        """Fetch the current LTP of Nifty 50."""
        pass

    @abstractmethod
    def place_order(self, symbol: str, action: str, quantity: int, price: float):
        """
        Execute the trade. 
        'action' should support 'Sell Put', 'Buy Put', etc.
        """
        pass