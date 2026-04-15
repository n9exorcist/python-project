// Pure function that takes in the current state and an action, and returns a new state based on the action type

const useReducery = (state, action) => {
  switch (action.type) {
    case "INCREMENT":
      return { count: state.count + 1 };
    case "DECREMENT":
      return { count: state.count - 1 };
    default:
      return state;
  }
};

export default useReducery;
