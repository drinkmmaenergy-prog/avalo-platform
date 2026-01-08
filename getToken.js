const fetch = require("node-fetch");

const email = "demo@avalo.local";
const password = "demo123";

const getToken = async () => {
  const res = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  console.log("\nYour ID token:\n");
  console.log(data.idToken || data);
};

getToken();
