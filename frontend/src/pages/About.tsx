import React from 'react';
import { PublicHeader } from '../components/layout/PublicHeader';

export function About() {
  return (
    <div className="flex h-full min-h-screen flex-col bg-white font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <PublicHeader />
      <main className="flex-1 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-950 dark:to-slate-900">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-8">About Us</h1>
          
          <div className="prose prose-lg">
            <p className="text-gray-600 mb-6">
              Lead Lab is a cutting-edge lead management platform designed to help businesses
              streamline their sales process and maximize conversion rates through advanced
              analytics and intelligent insights.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">Our Mission</h2>
            <p className="text-gray-600 mb-6">
              Our mission is to empower businesses with data-driven insights and tools that
              make lead management more efficient and effective, ultimately helping them grow
              and succeed in today's competitive market.
            </p>

            <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">Our Vision</h2>
            <p className="text-gray-600 mb-6">
              We envision a future where businesses of all sizes can harness the power of
              advanced analytics and machine learning to make informed decisions about their
              leads and sales processes.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
