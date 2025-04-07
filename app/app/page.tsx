"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useUserStore } from "@/lib/store";

export default function Home() {
  const [firstName, setFirstName] = useState("");
  const router = useRouter();
  const { setName } = useUserStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (firstName.trim()) {
      // 1. Store name in the global store
      setName(firstName.trim());
      // 2. Then navigate
      router.push("/dashboard");
    }
  };

  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center relative">
      <div className="absolute top-8 left-8">
        <Image
          src="/inl-logo.png"
          alt="INL Logo"
          width={150}
          height={150}
          className="opacity-80"
        />
      </div>
      
      <h1 className="text-8xl font-bold text-black mb-16 tracking-wider">
        GDO
      </h1>

      <Card className="w-96 p-6 bg-white shadow-lg border border-navy-100/20">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="text"
            placeholder="Type first name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="border-navy-200 text-black placeholder:text-gray-400"
          />
        </form>
      </Card>
    </main>
  );
}