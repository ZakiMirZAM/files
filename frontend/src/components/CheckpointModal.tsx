import { useState } from "react";
import { Id } from "../../convex/_generated/dataModel";

interface Checkpoint {
  _id: Id<"checkpoints">;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

interface CheckpointModalProps {
  checkpoint: Checkpoint;
  onComplete: (checkpointId: Id<"checkpoints">) => void;
  onClose: () => void;
}

export function CheckpointModal({ checkpoint, onComplete, onClose }: CheckpointModalProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const handleSubmit = () => {
    if (selectedAnswer === null) return;
    
    const correct = selectedAnswer === checkpoint.correctAnswer;
    setIsCorrect(correct);
    setShowResult(true);
  };

  const handleContinue = () => {
    if (isCorrect) {
      onComplete(checkpoint._id);
    } else {
      setShowResult(false);
      setSelectedAnswer(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <h3 className="text-xl font-semibold text-gray-900">
              Comprehension Checkpoint
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <p className="text-lg text-gray-800 leading-relaxed">
                {checkpoint.question}
              </p>
            </div>

            {!showResult && (
              <div className="space-y-3">
                {checkpoint.options.map((option, index) => (
                  <label
                    key={index}
                    className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                      selectedAnswer === index
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="answer"
                      value={index}
                      checked={selectedAnswer === index}
                      onChange={() => setSelectedAnswer(index)}
                      className="mt-1"
                    />
                    <span className="text-gray-800">{option}</span>
                  </label>
                ))}
              </div>
            )}

            {showResult && (
              <div className={`p-4 rounded-lg ${
                isCorrect ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  {isCorrect ? (
                    <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className={`font-semibold ${
                    isCorrect ? "text-green-800" : "text-red-800"
                  }`}>
                    {isCorrect ? "Correct!" : "Not quite right"}
                  </span>
                </div>
                
                <p className={`${isCorrect ? "text-green-700" : "text-red-700"}`}>
                  {checkpoint.explanation}
                </p>

                {!isCorrect && (
                  <p className="text-red-600 mt-2 text-sm">
                    The correct answer is: <strong>{checkpoint.options[checkpoint.correctAnswer]}</strong>
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              {!showResult ? (
                <button
                  onClick={handleSubmit}
                  disabled={selectedAnswer === null}
                  className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Submit Answer
                </button>
              ) : (
                <button
                  onClick={handleContinue}
                  className={`px-6 py-2 font-semibold rounded-lg transition-colors ${
                    isCorrect
                      ? "bg-green-600 text-white hover:bg-green-700"
                      : "bg-red-600 text-white hover:bg-red-700"
                  }`}
                >
                  {isCorrect ? "Continue" : "Try Again"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
