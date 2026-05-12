import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { CompanyAnalysis } from "./components/CompanyAnalysis";
import { useState } from "react";
import LandingPage from "./LandingPage";

export default function App() {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Authenticated>
        <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b shadow-sm">
          <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">IE</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900">IntrinsicEd</h1>
            </div>
            <SignOutButton />
          </div>
        </header>
      </Authenticated>

      <main className="flex-1">
        <Authenticated>
          <CompanyAnalysis />
        </Authenticated>
        
        <Unauthenticated>
          {showAuth ? (
            <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-8">
              <div className="w-full max-w-md">
                <button
                  onClick={() => setShowAuth(false)}
                  className="mb-6 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  ← Back
                </button>
                <SignInForm />
              </div>
            </div>
          ) : (
            <LandingPage onGetStarted={() => setShowAuth(true)} />
          )}
        </Unauthenticated>
      </main>
      
      <Toaster />
    </div>
  );
}
