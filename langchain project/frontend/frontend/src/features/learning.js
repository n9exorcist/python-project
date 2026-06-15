import React, { useEffect, useState, useContext, createContext, useRef, useMemo,
 lazy, Suspense, useCallback} from "react";

import {useSelector, useDispatch} from "react-redux";
 
export const myContext = createContext;

const FRUITS = ["Apple, Mango"]

const CodeSplit = lazy(() => import("./others/codeSplit"))

function ComponentState() {
  const contextValue = useContext(myContext);
  const [userId, setUserid] = useState("");
  const [inputValue, setInputValue ] = useState('');
  const inputRef = useRef(null);
  const [searchItem, setSearchItem ] = useState("");
  const countPizza = useSelector((state) => state.pizza.value)
  const dispatch = useDispatch();
  
  const handleInputChange = useCallback((e) => {
    setInputValue(e.target.value);
  }, [])
  
  const handleClick = () => {
    const value = inputRef.current.value;
    alert(`you typed: ${value}`);
  }
  
  useEffect(()=> {
    const fetchData = async() => {
      const response = await fetch("https")
      const result = await response.json()
      setUserid(result);
    };
    fetchData()
  }, [userId])


  const filtered = useMemo(() => {
    const q = searchItem.trim().toLowerCase();
    if(!q) return FRUITS;
    return FRUITS.filter((fruit => fruit.toLowerCase().includes(q)))
  }, [searchItem])
  return (
    <>
      <p>{userId.title}</p>
      <p>{contextValue}</p>
      <input type = "text" value={inputValue} onChange={()=>handleInputChange}/>
      <p>you typed : {inputValue} </p>
      <input type = "text" ref={inputRef} />
      <button onClick = {handleClick}>Click </button>
      <Suspense fallback={<div>Loading..</div>}>
        <CodeSplit/>
      </Suspense>
      <input value = {searchItem} onChange = {(e) => setSearchItem(e.target.value)}/>
      <ul>
        {filtered.map((fruit)=> (
          <li key={fruit}>{fruit}</li>
        ))}
      </ul>
      <h1> current count pizza: {countPizza} </h1>
      <button onClick={() => dispatch(increment())}>Add</button>
      <button onClick={() => dispatch(decrement())}>Subtract</button>
    </>
  );
}

export default ComponentState;

const Parent = () => {
  const contextValue = "Helo from context";
  return (
    <myContext.Provider value={contextValue}>
      <ComponentState/>
    </myContext.Provider>
  )
}

const CodeSplit = () => {
  return <div>My Component</div>
}

const HocLogger = (HocUse) => {
  return function WithLogger(props) {
    console.log("I'm from Logger")
    return <HocUse/>
  }
}

const HocUse = () => {
  return <div> My component content </div>
}

export default HocLogger(HocUse);

export default ParentCompoent = () => {
  const calllback = (data) => {
    console.log("Data from Child", data)
  }
  
  return (
    <>
    <ChildComponent fromChild = {calllback}/>
    </>
  )
}

const ChildComponent = ({fromChild}) => {
  
  const dataToParent = () => {
    fromChild(document.getElementById("inputField").value);
  }
  
  return (
    <>
      <input type="text" id="inputField" />
      <button onClick={dataToParent}>Send</button>
    </>
  )
}

import { createSlice } from "@reduxjs/toolkit";

const counterSlice = createSlice({
  name: 'counter',
  initialState:{value:0},
  reducers: {
    increment: (state) => {
      state.value += 1;
    },
    decrement: (state) => {
      state.value -= 1;
    }
  }
});

export const {increment,decrement} = counterSlice.actions;

export default counterSlice.reducer;

import { configureStore } from "@reduxjs/toolkit";
import counterReducer from "./counterSlice"

export const store = configureStore({
  reducer: {
    pizza: counterReducer
  }
})
