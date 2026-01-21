import React, { useEffect, useMemo, useRef } from "react"
import { Confetti, type ConfettiRef } from "@/registry/magicui/confetti"
import { NumberTicker } from "@/registry/magicui/number-ticker"

type SoftSkillTrait = {
    name: string
    score: number
}

type SoftSkillsSectionProps = {
    softSkillsAverageScore: number
    softSkillsTraits: SoftSkillTrait[] // expected length: 10
}

export default function SoftSkillsSection({
    softSkillsAverageScore,
    softSkillsTraits,
}: SoftSkillsSectionProps) {
    // ✅ Confetti enabled for >= 7 (including exactly 7)
    const showConfetti = Number(softSkillsAverageScore) >= 7

    const confettiRef = useRef<ConfettiRef>(null)

    // ✅ Fire confetti with better spread and visibility
    useEffect(() => {
        if (!showConfetti) return

        const timer = setTimeout(() => {
            const duration = 3 * 1000;
            const animationEnd = Date.now() + duration;
            const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0, gravity: 0.5 };

            const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

            const interval = setInterval(function () {
                const timeLeft = animationEnd - Date.now();

                if (timeLeft <= 0) {
                    return clearInterval(interval);
                }

                const particleCount = 50 * (timeLeft / duration);
                // Burst from left side
                confettiRef.current?.fire({
                    ...defaults,
                    particleCount,
                    origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
                });
                // Burst from right side
                confettiRef.current?.fire({
                    ...defaults,
                    particleCount,
                    origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
                });
            }, 250);

            return () => clearInterval(interval);
        }, 500)

        return () => clearTimeout(timer)
    }, [showConfetti])

    // ✅ Keep first 10
    const traits = useMemo(() => {
        return Array.isArray(softSkillsTraits) ? softSkillsTraits.slice(0, 10) : []
    }, [softSkillsTraits])

    return (
        <div className="relative overflow-hidden rounded-2xl bg-white p-8 shadow-sm border border-slate-100">
            {/* ✅ Confetti as BACKGROUND - Increased visibility and full spread */}
            {showConfetti && (
                <Confetti
                    ref={confettiRef}
                    className="pointer-events-none absolute inset-0 z-0 h-full w-full"
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                        zIndex: 0,
                        opacity: 0.8 // Much more visible now
                    }}
                />
            )}

            {/* ✅ UI content ABOVE confetti */}
            <div className="relative z-10">
                <h2 className="mb-8 text-xl font-semibold text-slate-900">
                    Overall Soft Skills
                </h2>

                <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-3">
                    {/* ✅ LEFT (Average Score Circle) */}
                    <div className="flex flex-col items-center justify-center">
                        <div className="flex h-40 w-40 items-center justify-center rounded-full border-[8px] border-orange-500 bg-white" style={{ boxShadow: '0 4px 12px rgba(245, 158, 11, 0.1)' }}>
                            <div className="flex flex-col items-center justify-center">
                                {/* ✅ NumberTicker */}
                                <div className="text-4xl font-bold leading-none text-orange-500">
                                    <NumberTicker
                                        value={Number(softSkillsAverageScore)}
                                        decimalPlaces={1}
                                        className="text-4xl font-bold text-orange-500"
                                    />
                                </div>
                                <div className="mt-1 text-sm text-slate-500">/10</div>
                            </div>
                        </div>

                        <p className="mt-4 text-sm text-slate-500">Average of all traits</p>

                        {/* ✅ Motivational Badge */}
                        <div className="mt-4">
                            {showConfetti ? (
                                <div className="rounded-full bg-green-100 px-4 py-2 text-sm font-semibold text-green-700">
                                    Nice job! Your soft skills are improving 🌟
                                </div>
                            ) : (
                                <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">
                                    Keep practicing, you’ll improve soon 💪
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ✅ RIGHT (Traits List) */}
                    <div className="lg:col-span-2 grid grid-cols-1 gap-4 md:grid-cols-2">
                        {traits.map((trait) => (
                            <div
                                key={trait.name}
                                className="flex items-center justify-between rounded-xl bg-slate-50 px-6 py-4 border border-slate-100"
                            >
                                <span className="text-sm font-medium text-slate-700">
                                    {trait.name}
                                </span>

                                <span
                                    className={`text-base font-bold ${trait.score >= 8
                                        ? "text-green-600"
                                        : trait.score >= 5
                                            ? "text-orange-500"
                                            : trait.score > 0 ? "text-red-500" : "text-slate-400"
                                        }`}
                                >
                                    {Number(trait.score).toFixed(1)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
